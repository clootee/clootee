"""Source ZIP from a committed snapshot, preserving Unix modes and Windows CRLF."""
import hashlib, io, json, pathlib, subprocess, tarfile, tempfile, zipfile
root = pathlib.Path(__file__).resolve().parents[2]
version = json.loads((root / 'projects/claude_hub/backend/package.json').read_text())['version']
out = root / 'release-output'
out.mkdir(exist_ok=True)
target = out / f'clootee-{version}-source.zip'
with tempfile.TemporaryDirectory() as temp:
    snapshot = pathlib.Path(temp) / 'public.tar'
    subprocess.run(['node', 'scripts/release/public-snapshot.mjs', 'archive', str(snapshot)], cwd=root, check=True)
    raw = snapshot.read_bytes()
with tarfile.open(fileobj=io.BytesIO(raw)) as tar, zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for entry in tar:
        if not entry.isfile(): continue
        # Even a mistakenly tracked credential must not become a public package.
        parts = pathlib.PurePosixPath(entry.name).parts
        if any(p in ('node_modules', 'data', '.secrets', 'payload', 'runtimes', 'output') for p in parts): continue
        if pathlib.PurePosixPath(entry.name).name.startswith('.env'): continue
        data = tar.extractfile(entry).read()
        if entry.name.endswith(('.bat', '.cmd', '.ps1')):
            data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        elif entry.name.endswith(('.sh', '.command')):
            data = data.replace(b'\r\n', b'\n')
        info = zipfile.ZipInfo(f'clootee-{version}/' + entry.name)
        info.create_system = 3
        info.external_attr = (0o100000 | entry.mode) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, data)
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    assert json.loads(archive.read(f'clootee-{version}/version.json'))['version'] == version
print(target.name, target.stat().st_size, hashlib.sha256(target.read_bytes()).hexdigest())
