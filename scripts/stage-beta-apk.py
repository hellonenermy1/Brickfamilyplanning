import hashlib,json,pathlib,zipfile,sys
archive=pathlib.Path(sys.argv[1])
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='2a814c50dea71fc88b03ca538f017808671b1baa3943a4d64c3bcd367a509e05','Unexpected signed artifact archive'
with zipfile.ZipFile(archive) as z:
    apk=z.read('Brick-V1-1.0.0-beta.1.apk')
    m=json.loads(z.read('build-manifest.json'))
    digest=hashlib.sha256(apk).hexdigest()
    assert digest==m['apkSha256']=='30f3b53ea9fc5d432cae1a237e074c211f133bab4269d30de3f763e80f228eea'
    assert m['apkSourceSha']=='0b9f6facdd0f037c924f21d410e0a32d4f1dae89'
    assert m['signingCertSha256']=='bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790'
    assert m['releaseId']=='brick-beta-20261105-01' and m['versionCode']==11 and m['automaticExpiry'] is False
    p=pathlib.Path('beta-artifact');p.mkdir(exist_ok=True);(p/'Brick.apk').write_bytes(apk)
print('Verified exact permanent-signed APK artifact, release, source and SHA256')
