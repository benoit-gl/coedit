# Packed H5000 evidence archive

Read [REPORT.md](REPORT.md) for the storage-only result, source/input identity, memory scope and supervision gap.
The worker completed all 35,011 exact logical Refs and 5,001 historical text/Origin projections.
The original supervisor did not finish recording the run; complete packed peak RSS is unavailable.
This package establishes no full packed carrier lifecycle or production eligibility result.

Run the offline integrity check from any directory with Python 3:

```sh
python3 /path/to/packed-h5000/verify-package.py.txt
```

The check needs only the files in this directory. It verifies exact manifest coverage, every archived byte hash,
source/native/harness binding consistency, recorded summary/phase/audit agreement and the preserved monitoring gap.
It does not execute the native runtime, reread omitted inputs or independently rerun semantic/projection validation.
Those successful workload checks are recorded by the archived executed harness and synchronous worker journals.

[package-manifest.json](package-manifest.json) hashes every package file except itself.
[archive-map.json](archive-map.json) maps the 35 byte-exact archival copies to their original scratch paths.
Their `.txt` suffixes preserve executable/raw journal bytes through repository format checks.
The remaining files are packaging documentation, manifests and the offline verifier.

No native binaries, WASM or detached command tapes are included.
[inputs-manifest.json](inputs-manifest.json) retains exact paths, byte lengths, SHA256 values and replay limits.
Those hashes identify omitted bytes; exact replay requires the retained scratch artifacts and bound dependencies.
Regenerating the workload authors fresh continuation identities and requires a new binding.
The original artifacts remain unchanged. Packaging ran integrity/document checks only, without a workload rerun.
