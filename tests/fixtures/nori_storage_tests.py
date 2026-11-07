import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch

from nori_updater_tests import module, FakeHost, OLD_REVISION, NEW_REVISION, NEWER_REVISION
import nori_storage as storage


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()

    def test_hardlinks_count_once_and_symlinks_do_not_count_external_data(self):
        roots = [self.base / name for name in ('a', 'b')]
        for root in roots:
            root.mkdir()
        (roots[0] / 'pack').write_bytes(b'x' * 10000)
        os.link(roots[0] / 'pack', roots[1] / 'pack')
        one = storage.allocated_bytes([roots[0]])
        self.assertEqual(storage.allocated_bytes(roots), one)
        outside = self.base / 'outside'
        outside.write_bytes(b'x' * 100000)
        (roots[1] / 'link').symlink_to(outside)
        self.assertLess(storage.allocated_bytes(roots), one + 100000)

    def test_private_archive_verified_content_permissions_links_and_idempotency(self):
        root = self.base / 'rollback'
        (root / 'runtime').mkdir(parents=True)
        (root / 'runtime/session').write_bytes(b'synthetic-session\x00data')
        os.chmod(root / 'runtime/session', 0o600)
        (root / '.env').write_text('SYNTHETIC=fixture')
        outside = self.base / 'outside'
        outside.write_text('never archive the symlink target')
        (root / 'runtime/link').symlink_to(outside)
        archive = self.base / 'archives/private.tar.gz'
        storage.archive_private(root, ['runtime', '.env'], archive)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        with tarfile.open(archive) as stream:
            self.assertEqual(stream.extractfile('runtime/session').read(), b'synthetic-session\x00data')
            self.assertEqual(stream.getmember('runtime/session').mode, 0o600)
            self.assertTrue(stream.getmember('runtime/link').issym())
            self.assertNotIn('outside', stream.getnames())
        storage.archive_private(root, ['runtime', '.env'], archive)
        (root / 'runtime/session').write_text('changed since the archive')
        with self.assertRaises(ValueError):
            storage.archive_private(root, ['runtime', '.env'], archive)
        self.assertTrue((root / 'runtime/session').exists())

    def test_mounted_or_symlinked_parent_is_not_archived_or_deleted(self):
        root = self.base / 'root'
        (root / 'runtime/mount').mkdir(parents=True)
        with patch.object(storage.os.path, 'ismount', side_effect=lambda p: Path(p) == root / 'runtime/mount'):
            with self.assertRaises(ValueError):
                storage.remove_tree(root)
        outside = self.base / 'outside'
        outside.mkdir()
        (outside / 'file').write_text('keep')
        (root / 'linked').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            storage.fingerprint(root, ['linked/file'])
        self.assertTrue((outside / 'file').exists())


class ShallowSourceTests(unittest.TestCase):
    def test_fetch_only_fixed_commit_ignores_branch_history_and_abandoned_packs(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            origin, destination = base / 'origin', base / 'checkout'
            def git(root, *args):
                return subprocess.check_output(['git', '-C', str(root), *args], text=True, stderr=subprocess.DEVNULL).strip()
            subprocess.run(['git', 'init', '-q', str(origin)], check=True)
            git(origin, 'config', 'user.email', 'fixture@example.test')
            git(origin, 'config', 'user.name', 'Fixture')
            (origin / 'source').write_text('pinned source')
            git(origin, 'add', '.')
            git(origin, 'commit', '-qm', 'pin')
            pin = git(origin, 'rev-parse', 'HEAD')
            git(origin, 'switch', '-qc', 'irrelevant-history')
            (origin / 'unneeded').write_text('unneeded branch data')
            git(origin, 'add', '.')
            git(origin, 'commit', '-qm', 'irrelevant')
            unrelated = git(origin, 'rev-parse', 'HEAD')
            (origin / '.git/objects/pack/tmp_pack_fixture').write_bytes(b'x' * 10000)
            host = module.Host.__new__(module.Host)
            def command(args, **kwargs):
                result = subprocess.run(list(map(str, args)), check=True, capture_output=True, text=True)
                return result.stdout.strip() if kwargs.get('capture') else ''
            host.command = command
            with patch.object(module, 'OPENCLAW_REPOSITORY', origin.as_uri()):
                host.fetch_upstream(pin, destination)
            self.assertEqual(git(destination, 'rev-parse', 'HEAD'), pin)
            self.assertEqual(git(destination, 'rev-parse', '--is-shallow-repository'), 'true')
            self.assertEqual(git(destination, 'remote'), '')
            self.assertEqual(git(destination, 'for-each-ref'), '')
            self.assertFalse(list((destination / '.git/objects/pack').glob('tmp_pack_*')))
            self.assertNotEqual(subprocess.run(['git', '-C', str(destination), 'cat-file', '-e', unrelated],
                                              capture_output=True).returncode, 0)


class ArtifactReuseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name).resolve()
        self.host = module.Host.__new__(module.Host)
        self.host.root, self.host.state = base / 'live', base / 'state'
        self.destination = base / 'candidate'
        for path in (self.host.root, self.host.state, self.destination):
            path.mkdir()
        self.host.uid, self.host.gid = os.getuid(), os.getgid()
        self.paths = ['.toolchain/node_modules', 'vendor/openclaw/node_modules', 'vendor/openclaw/dist']
        for name in self.paths:
            path = self.host.root / name
            path.mkdir(parents=True)
            (path / 'fixture').write_text('built artifact')
        (self.host.root / 'vendor/openclaw/node_modules/relative-link').symlink_to('fixture')
        self.host.revision = Mock(return_value=OLD_REVISION)
        self.host.artifact_identity = Mock(return_value={'schema': 1, 'upstream': NEW_REVISION, 'node': '24.16.0'})
        self.host.command = lambda args, **kwargs: subprocess.run(list(map(str, args)), check=True, capture_output=True)
        self.host.seal_artifacts(self.host.root, self.paths)

    def test_verified_artifacts_copy_without_mutable_cross_release_hardlinks(self):
        self.assertTrue(self.host.restore_artifacts(self.destination))
        source = self.host.root / 'vendor/openclaw/dist/fixture'
        copied = self.destination / 'vendor/openclaw/dist/fixture'
        self.assertNotEqual(source.stat().st_ino, copied.stat().st_ino)
        copied.write_text('candidate-only change')
        self.assertEqual(source.read_text(), 'built artifact')
        self.assertTrue((self.destination / 'vendor/openclaw/node_modules/relative-link').is_symlink())

    def test_mutated_artifact_or_toolchain_identity_forces_cold_build(self):
        (self.host.root / 'vendor/openclaw/dist/fixture').write_text('tampered')
        self.assertFalse(self.host.restore_artifacts(self.destination))
        self.host.seal_artifacts(self.host.root, self.paths)
        self.host.artifact_identity.return_value = {'schema': 1, 'upstream': NEW_REVISION, 'node': '26.1.0'}
        self.assertFalse(self.host.restore_artifacts(self.destination))

    def test_manifest_cannot_copy_runtime_or_git_history(self):
        path = self.host.artifact_record(OLD_REVISION)
        manifest = module.read_json(path)
        for extra in ('runtime', '../private', 'vendor/openclaw/.git'):
            module.atomic_json(path, {**manifest, 'paths': [*self.paths, extra]})
            self.assertFalse(self.host.restore_artifacts(self.destination))


class SpaceLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.host = FakeHost(self.base)
        self.host.config.update(preserve=['runtime'], minimumRuntimeFreeGiB=0, buildCacheGrowthGiB=0)
        self.updater = module.Updater(self.host)
        output = contextlib.redirect_stdout(io.StringIO())
        output.__enter__()
        self.addCleanup(output.__exit__, None, None, None)

    def backups(self, count):
        result = []
        for i in range(count):
            path = self.host.releases / f'previous-candidate-{i:012x}-{i:08x}'
            (path / 'runtime').mkdir(parents=True)
            (path / 'runtime/session').write_text(f'private snapshot {i}')
            os.utime(path, (100 + i, 100 + i))
            result.append(path)
        return result

    def test_byte_budget_and_pressure_keep_two_complete_rollbacks_and_archive_older_state(self):
        backups = self.backups(3)
        self.host.config['rollbackMaxGiB'] = 0
        self.updater.prune_rollbacks()
        self.assertFalse(backups[0].exists())
        self.assertTrue(all(p.exists() for p in backups[1:]))
        archive = next((self.host.state / 'private-archives').glob('*.tar.gz'))
        with tarfile.open(archive) as stream:
            self.assertEqual(stream.extractfile('runtime/session').read(), b'private snapshot 0')

    def test_two_successive_deployments_do_not_deadlock_at_exactly_three_backups(self):
        self.backups(3)
        self.host.config['minimumFreeGiB'] = 30000 / storage.GIB
        def usage(_):
            # A bounded disk: running release + each rollback/candidate use 20k.
            count = len(list(self.host.releases.glob('previous-*'))) + len(list(self.host.releases.glob('candidate-*')))
            free = 80000 - 20000 * count
            return shutil._ntuple_diskusage(100000, 100000 - free, free)
        with patch.object(module.shutil, 'disk_usage', side_effect=usage):
            self.updater.run()
            self.host.latest_values = [NEWER_REVISION, NEWER_REVISION]
            self.updater.run()
        self.assertEqual(self.host.revision(self.host.root), NEWER_REVISION)
        self.assertEqual(self.host.events.count('stop'), 2)
        self.assertEqual(len(list(self.host.releases.glob('previous-*'))), 2)
        self.assertEqual((self.host.root / 'runtime/session').read_text(), 'original-private-state')
        self.assertGreaterEqual(len(list((self.host.state / 'private-archives').glob('*.tar.gz'))), 3)

    def test_cutover_reserve_failure_defers_before_stopping_and_removes_candidate(self):
        def check(phase, required):
            if phase == 'before_cutover':
                raise module.UpdateError('insufficient_cutover_space')
            return required
        with patch.object(self.updater, 'check_space', side_effect=check), self.assertRaises(module.UpdateError):
            self.updater.run()
        self.assertNotIn('stop', self.host.events)
        self.assertFalse(self.updater.journal.exists())
        self.assertEqual(module.read_json(self.updater.status)['state'], 'deferred')
        self.assertEqual(list(self.host.releases.glob('candidate-*')), [])

    def test_failed_and_superseded_builds_do_not_accumulate(self):
        self.host.build_failure = True
        with self.assertRaises(module.UpdateError):
            self.updater.run()
        self.assertEqual(list(self.host.releases.glob('candidate-*')), [])
        self.host.build_failure = False
        self.host.latest_values = [NEW_REVISION, NEWER_REVISION]
        self.updater.run(retry=True)
        self.assertEqual(list(self.host.releases.glob('candidate-*')), [])

    def test_only_registered_pre_state_copy_candidates_are_reaped(self):
        paths = []
        for i, phase in enumerate(('building', 'preserving', 'building', None)):
            path = self.host.releases / f'candidate-{i:012x}-{i:08x}'
            path.mkdir()
            if phase:
                module.atomic_json(self.updater.candidate_marker(path), {'phase': phase})
            paths.append(path)
        (paths[2] / 'runtime').mkdir()
        self.updater.prune_candidates()
        self.assertFalse(paths[0].exists())
        self.assertTrue(all(p.exists() for p in paths[1:]))

    def test_archive_verification_failure_preserves_original_backup(self):
        backups = self.backups(3)
        self.host.config['rollbackMaxGiB'] = 0
        with patch.object(storage, 'verify_archive', side_effect=ValueError('corrupt')):
            self.updater.prune_rollbacks()
        self.assertTrue(all(p.exists() for p in backups))

    def test_post_commit_accounting_failure_does_not_relabel_healthy_release(self):
        with patch.object(self.updater, 'required_build_bytes', side_effect=[0, OSError('scan failed')]):
            self.updater.run()
        self.assertEqual(module.read_json(self.updater.status)['state'], 'updated')
        self.assertEqual(self.host.revision(self.host.root), NEW_REVISION)


if __name__ == '__main__':
    unittest.main()
