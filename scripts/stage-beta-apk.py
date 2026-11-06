import hashlib,json,pathlib,zipfile,sys
archive=pathlib.Path(sys.argv[1])
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='6e9fd490fd647890b64f2d829852249ac45ea75055d3ef10b47c3c5ecbba5af0','Unexpected signed artifact archive'
with zipfile.ZipFile(archive) as z:
    apk=z.read('Brick-V1-1.0.0-beta.2.apk')
    m=json.loads(z.read('build-manifest.json'))
    digest=hashlib.sha256(apk).hexdigest()
    assert digest==m['apkSha256']=='bc41361015070a0990cbc8d53898dee176133abb106836209e0fe46ece364764'
    assert m['apkSourceSha']=='dda193f79598fec0d814883b13fb3c16f5021817'
    assert m['signingCertSha256']=='bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790'
    assert m['releaseId']=='brick-phase1-20261106-01' and m['versionCode']==12 and m['automaticExpiry'] is False
    p=pathlib.Path('beta-artifact');p.mkdir(exist_ok=True);(p/'Brick.apk').write_bytes(apk)
print('Verified exact permanent-signed APK artifact, release, source and SHA256')
