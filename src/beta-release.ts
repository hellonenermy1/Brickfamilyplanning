export const BETA_RELEASE = {
 releaseId: 'brick-beta-20261105-01', apkSourceSha: 'fa52547d89929e2032fc8ced4511b79e9bf8a23c',
 versionName: '1.0.0-beta.1', versionCode: 11, applicationId: 'com.brick.safety', automaticExpiry: false,
 available: true, availability: 'APPROVED_D1_TESTONLY_BETA',
 apkSha256: '0ab070bea12ca607b0a38ee863087aadddb44c9f2a8c60ac496b914d1166a6fc',
 signingCertSha256: 'bfdeb49714fea714536c47f8126deed700f00b2dd113c5c0d452992d7ed5f790',
 artifactRunId: 41973723331, artifactId: 13391590323
} as const;
export const BETA_APK_KEY = 'beta/releases/brick-beta-20261105-01/Brick.apk';

/**
 * Signed Android clients allowed to report beta readiness/observations.
 * NOT a list of APKs approved for parent download. Beta 2 is installed in the
 * field but its automatic fall sensor has a confirmed false-positive regression.
 * Never loosen this to a version prefix or source-SHA wildcard.
 */
export const BETA_COMPATIBLE_CLIENTS = [
 {releaseId:BETA_RELEASE.releaseId,apkSourceSha:BETA_RELEASE.apkSourceSha,versionName:BETA_RELEASE.versionName},
 {releaseId:'brick-phase1-20261106-01',apkSourceSha:'dda193f79598fec0d814883b13fb3c16f5021817',versionName:'1.0.0-beta.2'}
] as const;
export function findCompatibleBetaClient(releaseId:unknown,apkSourceSha:unknown){
 return BETA_COMPATIBLE_CLIENTS.find(c=>c.releaseId===releaseId&&c.apkSourceSha===apkSourceSha);
}
