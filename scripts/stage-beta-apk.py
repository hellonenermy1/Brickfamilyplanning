import hashlib,json,pathlib,zipfile,sys
archive=pathlib.Path(sys.argv[1])
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='9e80c2b7efdaf1b682dc3165d998d6cf9b676a57ec0cb7ab6fe78b41ed95ab8b','Unexpected signed artifact archive'
with zipfile.ZipFile(archive) as z:
    apk=z.read('Brick-V1-1.0.0-beta.1.apk')
    m=json.loads(z.read('build-manifest.json'))
    digest=hashlib.sha256(apk).hexdigest()
    assert digest==m['apkSha256']=='0ab070bea12ca607b0a38ee863087aadddb44c9f2a8c60ac496b914d1166a6fc'
    assert m['apkSourceSha']=='fa52547d89929e2032fc8ced4511b79e9bf8a23c'
    assert m['signingCertSha256']=='bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790'
    assert m['releaseId']=='brick-beta-20261105-01' and m['versionCode']==11 and m['automaticExpiry'] is False
    p=pathlib.Path('beta-artifact');p.mkdir(exist_ok=True);(p/'Brick.apk').write_bytes(apk)
print('Verified exact permanent-signed APK artifact, release, source and SHA256')
