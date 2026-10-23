# Vendored native components

These are the exact bytes pinned by `build/native-components-lock.json` (schema 1) and
`build/native-components.json`. They are checked into the repository so `npm ci` /
`npm run build:backend-native` never download executable code from the AIPOCH CDN.

- Upstream project: AIPOCH Open-Science, Apache-2.0.
- Upstream build workflow: `.github/workflows/native-components.yml`.
- Source base URL (metadata only): `https://statics.aipoch.com/open-science/native-components`.
- Integrity: each file is verified against the lock sha256 and size before it is copied
  into `packages/<package>/build/Release`. A mismatch fails the build.
- The lock `url` field and `build/native-components.json` `cdn` field are unchanged because
  the CDN base participates in `sourceFingerprint()`; changing either would invalidate the
  signed release catalog.

## Updating

1. Publish a new signed native-components release with the reviewed workflow.
2. In a trusted environment, run `node scripts/native-components.mjs --refresh-vendor`.
   The command downloads only the `url` values in the lock, checks sha256/size, and writes
   them here under `<target>/<sha256>/<name>`.
3. Review the byte diff, commit this directory, and run the normal build.

Do not add files by hand. Do not change a sha256 to match bytes you did not review.

| Target | File | Package | Size | SHA-256 |
| --- | --- | --- | ---: | --- |
| darwin-arm64 | credential_identity_probe | credential-identity-probe-native | 78288 | 139100cb995d8032638a7d26630054e36c725e41e17c58fe1693399af12819ab |
| darwin-arm64 | credential_key_validator | credential-identity-probe-native | 71968 | 57947d0f580cba580cedf437c8ac21de72d12d5b370ca5444cd304b0bcd2eb4d |
| darwin-arm64 | credential_secret | credential-identity-probe-native | 70640 | 0cb131f08c57de714e25c63e96aec0b7b42d4c37556eb867aca77f5ef0d40299 |
| darwin-arm64 | process_tree_native.node | process-tree-native | 72432 | 584cea8d830422430923469bb00cba06cd0d6c75aa7a9f371140b00234da16ec |
| darwin-arm64 | safe_file_publisher_native.node | safe-file-publisher-native | 100576 | aacf2512eca533460699d353b08ca45b03598c249bff7d3c465d47d45f711f81 |
| darwin-x64 | credential_identity_probe | credential-identity-probe-native | 53568 | dc9a32fceeafb257a796e01b64a1aea81f06c00632455c666fa7399dded7d8fd |
| darwin-x64 | credential_key_validator | credential-identity-probe-native | 38976 | 56bb3c4b0ef557a36dafb92be6fd71212456cca40e61edfe5caff772d9875856 |
| darwin-x64 | credential_secret | credential-identity-probe-native | 37616 | 8bb63668ac59aaf33cd1aef9137972586dcd97caff73c8e82ce0e4017fa84e2a |
| darwin-x64 | process_tree_native.node | process-tree-native | 39424 | 112ed2a4cef91466fd22552c304e7e42fafb4be7d6ccb01a6f2ea4cd264c39c9 |
| darwin-x64 | safe_file_publisher_native.node | safe-file-publisher-native | 71504 | 19734e1e6ea9abf924355efad8860c0f916e3852c9e2b268c87bad449edc5e3d |
| linux-arm64 | credential_identity_probe | credential-identity-probe-native | 72232 | 7d571c63ecc4dc0d864c504372667258a397dcf894f395755c9b9163133f8f1f |
| linux-arm64 | credential_key_validator | credential-identity-probe-native | 72120 | 626d05214745f37644266e4e56ac570e93abd166d51c4a54fb14b560c0c67b83 |
| linux-arm64 | credential_secret | credential-identity-probe-native | 73376 | 94a9ef3e6ad6e8f37b28dd30e6a2bfebfa523bee7f9508dc6edfeaa2b9b410f5 |
| linux-arm64 | process_tree_native.node | process-tree-native | 70432 | 6b3c1801b3d9d3e364531b7c117be85e6f0443f0f153d3217d0e6d3388330f4a |
| linux-arm64 | safe_file_publisher_native.node | safe-file-publisher-native | 77208 | dbd00448c908ad1eb9f7cced2fc594ed38382672587e3eb1be02afd23dbb4b30 |
| linux-x64 | credential_identity_probe | credential-identity-probe-native | 22080 | 0aeba4473542ca405345351e467ff05af0592d76005a5d4dde91e45fa1a493fc |
| linux-x64 | credential_key_validator | credential-identity-probe-native | 22024 | 3d255fe108824c44d3fbb48c984a302134e4aa3a2fab4afc8551a2b99e1ac6c2 |
| linux-x64 | credential_secret | credential-identity-probe-native | 26952 | 116570bb9ddf0643602d345ad6eed9f0e552c8c0663a4df6a2a8cf61c4e18f92 |
| linux-x64 | process_tree_native.node | process-tree-native | 16272 | 8e884fdc1eab31d18dbdc253d93e60dd76f8131e63e95aacd25f949204b20abe |
| linux-x64 | safe_file_publisher_native.node | safe-file-publisher-native | 55592 | 62dc41d38bc14807bdd9bff97527c227a046d6d8d8c86bee78ceb14483f74085 |
| win32-x64 | credential_identity_probe.exe | credential-identity-probe-native | 233208 | 01237596e999a769561b51f61d2c17860ed57630c2b75e1f199734be0b3ca5df |
| win32-x64 | credential_key_validator.exe | credential-identity-probe-native | 235256 | 52eef3ccc4496a09c179449be9db483d934d59d870c2f390b895a1f58660949a |
| win32-x64 | credential_secret.exe | credential-identity-probe-native | 229624 | 9bc1c732da90e7bddca62392c19eb34b9dab56f6841c96f52adf7d88d6a9d7ed |
| win32-x64 | process_tree_native.node | process-tree-native | 159480 | d189ee8e79dbe86e62136285ad1d61ce6cdea7e9a26cc4852ba9639eb77b6a25 |
| win32-x64 | safe_file_publisher_native.node | safe-file-publisher-native | 177912 | 0e31aa2f03e18d0c55f811441971471b68a67254146e40c718d5ee732588e3ba |
