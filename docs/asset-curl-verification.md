# Asset Curl Verification

This log captures the latest manual validation of the Infinite Rails static asset bundle using `curl`.

## Environment
- Tooling: `curl 8.x`
- Notes: Outbound HTTPS requests through the shared proxy returned `HTTP 403 (CONNECT tunnel failed)` for external hosts (for example `https://example.com`), so the verification leveraged a local static server to exercise the published asset paths.

## Commands

```bash
# Serve the repository root locally
python3 -m http.server 4173 &
SERVER_PID=$!
sleep 1

# Probe each public model/audio asset path
for path in \
  assets/arm.gltf \
  assets/steve.gltf \
  assets/zombie.gltf \
  assets/iron_golem.gltf \
  assets/audio-samples.json \
  assets/offline-assets.js; do
  echo "Checking $path"
  curl -I "http://127.0.0.1:4173/$path" | head -n 1
done

kill $SERVER_PID
```
```

## Results
- Every request returned `HTTP/1.0 200 OK` from the local server.
- No `403 Forbidden` responses were observed for the asset endpoints under the hosted bundle.

## Follow-up
- Once outbound HTTPS access is restored, rerun the same loop against the production distribution domain (for example `https://d3gj6x3ityfh5o.cloudfront.net/`) to confirm edge caching and bucket permissions still allow anonymous reads.
