"""Filesystem accounting and verified private-state archives for the installed updater.

All callers hold update.lock. Never follow directory symlinks or cross mounts, and
never infer reclaimable bytes by adding separate du results for hardlinked releases.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tarfile


GIB = 1024 ** 3


def relative_paths(names):
    paths = sorted(set(map(str, names)))
    for name in paths:
        path = Path(name)
        if path.is_absolute() or not path.parts or '..' in path.parts or str(path) != name:
            raise ValueError('invalid_relative_storage_path')
    return [name for name in paths if not any(str(p) in paths for p in Path(name).parents if str(p) != '.')]


def entries(root, names=None):
    """Yield stable relative names and lstat values, without dereferencing links."""
    root = Path(root)
    if root.is_symlink():
        raise ValueError('storage_root_is_symlink')
    device = root.stat().st_dev

    def visit(path):
        info = path.lstat()
        if info.st_dev != device or (stat.S_ISDIR(info.st_mode) and os.path.ismount(path)):
            raise ValueError('storage_contains_mount')
        yield str(path.relative_to(root)), info
        if stat.S_ISDIR(info.st_mode):
            for child in sorted(path.iterdir()):
                yield from visit(child)

    for name in relative_paths(names if names is not None else [p.name for p in root.iterdir()]):
        path = root / name
        for parent in path.parents:
            if parent == root:
                break
            if parent.is_symlink():
                raise ValueError('storage_parent_is_symlink')
        if path.exists() or path.is_symlink():
            yield from visit(path)


def allocated_bytes(roots):
    """Count shared inodes once across all requested roots."""
    seen, total = set(), 0
    for root in roots:
        root = Path(root)
        for _, info in entries(root):
            ident = info.st_dev, info.st_ino
            if ident not in seen:
                seen.add(ident)
                total += info.st_blocks * 512
    return total


def copy_bytes(root, names=None):
    # Independent copy operations may duplicate hardlinks; st_size also covers
    # sparse files conservatively. Never count the contents of a symlink target.
    return sum(max(info.st_size, info.st_blocks * 512) for _, info in entries(root, names))


def digest_file(path):
    digest = hashlib.sha256()
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def inventory(root, names):
    result = {}
    for name, info in entries(root, names):
        mode = stat.S_IMODE(info.st_mode)
        if stat.S_ISLNK(info.st_mode):
            value = ['link', mode, os.readlink(Path(root) / name)]
        elif stat.S_ISDIR(info.st_mode):
            value = ['directory', mode]
        elif stat.S_ISREG(info.st_mode):
            value = ['file', mode, info.st_size, digest_file(Path(root) / name)]
        else:
            raise ValueError('unsupported_storage_file_type')
        result[name] = value
    return result


def fingerprint(root, names):
    return hashlib.sha256(json.dumps(inventory(root, names), sort_keys=True).encode()).hexdigest()


def verify_archive(path, expected):
    actual = {}
    with tarfile.open(path, 'r:gz') as archive:
        for member in archive:
            if member.name in actual or member.name not in expected:
                raise ValueError('archive_unexpected_entry')
            if member.isdir():
                value = ['directory', member.mode]
            elif member.issym():
                value = ['link', member.mode, member.linkname]
            elif member.isfile():
                digest = hashlib.sha256()
                with archive.extractfile(member) as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        digest.update(chunk)
                value = ['file', member.mode, member.size, digest.hexdigest()]
            else:
                raise ValueError('archive_unsupported_entry')
            actual[member.name] = value
    if actual != expected:
        raise ValueError('private_archive_verification_failed')


def archive_private(root, names, destination):
    """Archive and verify every preserved entry before allowing code retirement.

    Archives remain root-private and are deliberately outside automatic deletion.
    If interrupted, repeat safely; an existing archive must match this snapshot.
    """
    root, destination = Path(root), Path(destination)
    expected = inventory(root, names)
    if not expected:
        return None
    destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if destination.is_symlink():
        raise ValueError('archive_is_symlink')
    if destination.exists():
        verify_archive(destination, expected)
        return destination
    temporary = destination.with_suffix('.tmp')
    try:
        with open(temporary, 'xb') as stream:
            os.chmod(temporary, 0o600)
            with tarfile.open(fileobj=stream, mode='w:gz', compresslevel=1, dereference=False) as archive:
                for name, value in sorted(expected.items()):
                    path = root / name
                    member = archive.gettarinfo(str(path), arcname=name)
                    if value[0] == 'file':
                        # Store a complete file even for repeated hardlinks, so
                        # verification and restoration never depend on extraction order.
                        member.type, member.linkname, member.size = tarfile.REGTYPE, '', value[2]
                        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as source:
                            archive.addfile(member, source)
                    else:
                        archive.addfile(member)
            stream.flush()
            os.fsync(stream.fileno())
        verify_archive(temporary, expected)
        if inventory(root, names) != expected:
            raise ValueError('private_snapshot_changed_during_archive')
        os.replace(temporary, destination)
        descriptor = os.open(destination.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        return destination
    finally:
        # A partial archive must not block a retry or be mistaken for a verified one.
        if temporary.exists():
            temporary.unlink()


def remove_tree(path):
    path = Path(path)
    if path.is_symlink() or os.path.ismount(path):
        raise ValueError('unsafe_storage_removal')
    # Complete the mount/type scan before deleting the first entry.
    for _ in entries(path):
        pass
    shutil.rmtree(path)
