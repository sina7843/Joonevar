# Implementation integrity

Preserve user changes and current repository policies. Never bypass rejected actions or managed permissions. Do not print/commit secrets, private KYC files, receipts or real test recipient data. Test with isolated synthetic fixtures and provider sandboxes. Server authorization is required for all record-specific actions and downloads. Rate-limit OTP; verify payments server-side; use transactional/version constraints for races. Files and provider callbacks are untrusted. Local commits are authorized; real sending/payment/deploy and remote push are separate actions.
