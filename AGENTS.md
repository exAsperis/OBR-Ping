# OBR Ping Project Instructions

- Keep all Owlbear SDK calls behind `OBR.onReady` and unsubscribe every listener.
- Keep identity fixed at `com.ex-asperis.obr-ping`, display name `OBR Ping`, and published author `ex Asperis`.
- Derive all metadata keys and registrations from `EXTENSION_ID`.
- Treat room metadata as shared, inspectable, and limited to 16 KB; validate data and preflight writes.
- Keep the extension usable without a scene and preserve Owlbear theme and keyboard accessibility.
- Keep release `0.1.0` synchronized across package, source, manifests, and hosted-resource queries.
- Do not push, deploy, or publish without explicit authorization.
