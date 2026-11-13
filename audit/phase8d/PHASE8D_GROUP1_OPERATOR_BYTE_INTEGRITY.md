# Group 1 — pinned operator physical source integrity

11 November 2026, Singapore. G1.1/G1.2, P8D-002 remains P1 OPEN. Executable `93383cfbb57f5852afb9eec6ab4721e378390af5`, tree `c91497d8fac676d4f4a0f589b071b02d80482507`; parent evidence checkpoint `638874a89cf89e3c9648fde97985baaf55c079ca`. PR32 remains draft/unmerged against beta base `141cbf42efaa61873c4fa87138ca5a0a19d404a2`.

## Reproduced defect and correction

The previous launcher/builder used `git diff --quiet HEAD` and an exclude-aware untracked list as clean-source evidence. In a controlled local reproduction, marking the tracked shared controller helper `assume-unchanged`, modifying it, then running that exact check returned exit0. Git index flags can therefore hide changed helper code before the dynamic operator import. No provider or deployed system was involved.

Both entry points now use `assertPinnedOperatorCheckout`. It verifies the pinned commit and staged tree, then independently walks the commit's complete tracked-file manifest and hashes each physical file as a Git blob. This does not rely on index cached metadata, checkout filters, or working-tree diff output. Regular file type, Git executable mode, single-link identity, canonical physical path, stable read length and before/after inode/stat identity are checked. Symlinks, gitlinks and unsupported tree modes refuse. Reads use 64KiB chunks and no-follow/nonblocking opens. Caller `GIT_*` redirection is removed during verification and Git replacement objects are disabled.

The source-directory untracked check includes ignored files; `.gitignore`, global excludes and `.git/info/exclude` cannot exempt additional modules. Only the generated `scripts/.brick-operator-launcher.mjs` is allowed. The launcher's verification code is bundled before its dynamic helper/tool imports. The builder has explicit repository-root `absWorkingDir`, so caller CWD no longer changes generated comment paths or artifact bytes. No production workflow was switched to the launcher.

## Bounded validation

- 12 focused physical-checkout tests: clean identity, both index flags, same-size mutation, executable mode, symlink/hardlink, ignored source, staged substitution, replacement commit, bad pins and clean recovery.
- 35 fresh-process/native signed launcher tests, including both hidden-helper flags refused before top-level marker execution, ignored source, redirected Git environment, actual builder refusal before artifact creation and identical root/unrelated-CWD builds. Existing all-four-tool capture refusal, successful verification/publication, unknown cleanup/release and private-config controls remain covered.
- External inventory regenerated:324 selected files,78 literal management candidates,90 classifications, one staged launcher and four direct beta mutators still unfenced. The90-file Worker graph is unchanged.
- Two clean local executable worktrees produced SHA256 `7ab2f32f89492060f9397d1f831fa4b8acd0ef2a48ca7ef9e1e9c9869773c0b3`; syntax and no-config redacted exit2 verified. Artifact is a local build, not installed operational custody.

All26 local workflow run groups passed (unchanged installed dependencies reused). Push42939907480/job130258972237 and PR42939916495/job130259000363 passed33/33 each; Phase2 42939916515/job130259000188 passed14/14, portal42939916498/job130259000547 passed10/10. Complete decoded logs have zero error markers and both audit logs contain35 launcher,12 physical-checkout and signed populated encrypted-recovery successes. PR merge `e96e3bab3a873548d5d40f8bd708e6eaec5916df` has expected base/source parents and identical source tree. Exact records are in `PHASE8D_GROUP1_OPERATOR_BYTE_INTEGRITY_EVIDENCE.json`. Earlier d6b3c4a CI/build evidence remains historical; its bundle hash does not qualify these changed executables.

## Operational limits

The Git executable, Node, installed build dependencies, initial source entry and host/local Git configuration remain trusted prerequisites. Checks are point-in-time observations, not protection against a malicious concurrent host replacing files after verification. No immutable installation, signed distribution, real HTTPS transport, independent guard/key/journal custody, account-wide raw-credential restriction, real schedule/alerts, or isolated cloud recovery is proved. Four direct tools still permit their legacy path unless explicitly controlled; do not activate a partial production fence.

No cloud/provider writes, family-data operations, permission/key changes, real notifications, R2/card/billing, APK/UI changes, merge or deployment. Canonical525 acceptance fields and214/311 phase mapping remain unchanged. Group1 `IN_PROGRESS_NOT_READY`; Phase8D `NOT_PASS`. Finish actual complete runtime/operator/bootstrap/raw-credential installation and independent custody, then approved isolated synthetic recovery/interruption/rollback with agreed measured RTO/RPO and genuine review.
