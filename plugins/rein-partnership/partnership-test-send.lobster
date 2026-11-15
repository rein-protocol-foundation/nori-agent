name: partnership-test-send
args:
  material: {}
steps:
  - id: preview
    command: >-
      "$PARTNERSHIP_NODE" -e 'process.stdout.write(process.env.LOBSTER_ARG_MATERIAL)'
    approval:
      prompt: Send this exact partnership draft to the designated test recipient?
  - id: approved_material
    command: >-
      "$PARTNERSHIP_NODE" -e 'process.stdin.pipe(process.stdout)'
    stdin: $preview.stdout
    condition: $preview.approved
