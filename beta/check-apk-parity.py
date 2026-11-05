"""Source/manifest parity, not a claim of working physical features."""
import json,re,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
base=json.loads(Path('beta/contract-v1.json').read_text())['baseSha']
def old(p):return subprocess.check_output(['git','show',base+':'+p])
files=subprocess.check_output(['git','ls-tree','-r','--name-only',base,'--','app/src/main']).decode().splitlines()
assert all(Path(p).is_file() for p in files),'An existing production app file was removed'
ns='{http://schemas.android.com/apk/res/android}'
before=ET.fromstring(old('app/src/main/AndroidManifest.xml'));after=ET.parse('app/src/main/AndroidManifest.xml').getroot()
for tag in ['uses-permission','uses-feature']:
 assert {x.attrib[ns+'name'] for x in before.findall(tag)}<={x.attrib[ns+'name'] for x in after.findall(tag)},tag+' removed'
for tag in ['activity','service','receiver','provider']:
 assert {x.attrib[ns+'name'] for x in before.find('application').findall(tag)}<={x.attrib[ns+'name'] for x in after.find('application').findall(tag)},tag+' removed'
beta=[x for x in after.find('application').findall('activity') if x.attrib[ns+'name']=='.beta.BetaReadinessActivity']
assert len(beta)==1 and beta[0].attrib[ns+'exported']=='false'
gradle=Path('app/build.gradle.kts').read_text()
assert 'applicationId = "com.brick.safety"' in gradle
assert 'buildConfigField("boolean", "BRICK_BETA", "false")' in gradle
assert 'buildConfigField("long", "BRICK_BETA_EXPIRY_EPOCH_MS", "0L")' in gradle
assert json.loads(Path('beta/contract-v1.json').read_text())['releaseId'] in gradle
assert not subprocess.check_output(['git','diff',base,'--','src','schema','public']).strip(),'Phase1 must not modify backend/runtime assets'
print('PASS baseline production files, permissions and components retained; same package, private diagnostics, expiry disabled; backend unchanged. Functional/device checks remain separate.')
