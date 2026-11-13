# Group 1 staged B2 encrypted archive destination

Group1 NOT READY; Phase8D NOT PASS; P8D-002 P1 OPEN. This module implements one missing off-platform transport capability. It is not installed, configured, scheduled or connected to a real provider. Prior read-only plugin inspection saw a connection and no visible buckets. No newer live storage, card/free-tier, independent key-custody or cloud recovery qualification is asserted.

## Implemented contract

`scripts/cardfree-b2-destination.mjs` exports an injected capability, not an executable CLI. It has no default fetch, environment credential reader, authorize-account call, bucket/key creation, deletion, sharing, provider configuration or automatic retry. A trusted future coordinator must supply independently reviewed destination pins, a scoped B2 v4 authorization response and transport. No production keys have been generated or installed.

The pin binds account, bucket ID/name, exact B2 API and download origins and the opaque `brick-recovery/` namespace. Authorization must match one bucket, the exact prefix, and exactly `listBuckets`, `readFiles`, `writeFiles`; account-wide, multi-bucket, share/delete/admin keys refuse. Provider tokens stay in memory and request headers, never URL parameters, receipts or errors. These checks depend on a trusted authorization response; they do not authenticate a fabricated caller-supplied object or establish real custody.

Publication authenticates the existing AES-GCM package with the separate caller-held key/context before any provider call. Bucket metadata must match the pin and be `allPrivate`. A scoped upload grant is validated before sending ciphertext; only its upload token goes to the documented upload pod. Upload uses explicit length, percent-encoded opaque file name, content type and B2 SHA1 transfer checksum. The exact acknowledgement binds account/bucket/version/name/length/hash. Readback uses file ID, never a mutable latest-by-name pointer, and verifies all identity headers plus SHA256, SHA1, exact bytes and local package authentication. Bucket privacy is checked again afterwards. A later read-only method validates the pinned receipt, private bucket and exact-version/hash; it composes with the existing archive-health checker using independently retained key/context.

Only ciphertext and opaque backup/hash names are sent; keys, trusted context, source/device/parent data and plaintext are never metadata. All requests refuse redirects/final-URL substitution, carry a single operation deadline/abort, cap streamed responses, and redact provider errors. SHA1 is transfer compatibility only; SHA256 and AES-GCM remain required. No capability claims that private metadata cannot change after observation, that a restricted key cannot overwrite/create versions, or that provider receipts prove recovery.

Once upload is attempted, any lost response, mismatched acknowledgement, timeout or readback/privacy failure reports `uploadMayExist:true` and UNVERIFIED. There is no retry, token fallback, deletion or cleanup that could erase an uncertain object. The future operator must reconcile versions against independently held opaque capture identity/hash before explicitly deciding next actions. The adapter offers no failed-publication receipt as successful evidence.

## Verification and limits

Adversarial tests cover actual adapter/Fetch Response streams, real AES-GCM and archive health with synthetic responses only. The full signed native 41+4/deviceDO recovery drill publishes its actual encrypted package through a separate disk-backed synthetic provider. After deleting source persistence and the original local archive, it recreates the transport, reads the exact retained encrypted version, authenticates health twice and restores into fresh D1/device objects; all existing populated relation/credential/revocation/restart/interruption checks remain.

The synthetic provider is not Backblaze, independent custody, a live private bucket or network/TLS/production transport proof. No real bucket, file, key, retention, permissions, billing or family data were changed. No production writer fence was partially activated. Production writer coverage, urgent-outage fallback, independent card-free storage/key custody, actual schedule/readback/age/failure/alert delivery, current PITR and isolated cloud restore/RTO/RPO remain open. PR32 stays draft/unmerged; no deployment.

## Primary protocol references inspected 7 November 2026

- https://www.backblaze.com/apidocs/b2-authorize-account — v4 restricted bucket/prefix/capability response and endpoint identity.
- https://www.backblaze.com/apidocs/b2-list-buckets — scoped bucket lookup; private type observed without changing it.
- https://www.backblaze.com/apidocs/b2-get-upload-url — upload grant, bucket ID and token; GET form supported.
- https://www.backblaze.com/apidocs/b2-upload-file — raw ciphertext POST, mandatory length, filename encoding, SHA1 and unique file ID. Both documented path and query upload URL shapes are supported.
- https://www.backblaze.com/apidocs/b2-download-file-by-id — authenticated GET by immutable file version and response identity/checksum headers.

Only the specifically supported strict URL, capability and metadata shapes are accepted; unsupported provider shapes fail closed and require explicit source review. No present pricing/card-free claim follows from protocol implementation.
