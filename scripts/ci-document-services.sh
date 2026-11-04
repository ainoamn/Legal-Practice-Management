#!/usr/bin/env bash
set -euo pipefail
test "${CI:-}" = "true" && test "${LEGAL_TEST_ENV:-}" = "1" || { echo 'CI isolated test environment required'; exit 1; }
umask 077
mkdir -p .local/ci-s3 .local/ci-storage
curl -fsSL --retry 3 https://github.com/seaweedfs/seaweedfs/releases/download/4.52/linux_amd64.tar.gz -o .local/ci-seaweedfs.tar.gz
echo '8b538c22d47d0c3fb6792adaa6b0c735a967401270a53427d5a476dcaca9b7ae  .local/ci-seaweedfs.tar.gz' | sha256sum -c -
tar -xzf .local/ci-seaweedfs.tar.gz -C .local weed
node --input-type=module <<'JS'
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const accessKey=randomBytes(12).toString('hex'),secretKey=randomBytes(32).toString('hex');
writeFileSync('.local/ci-s3/s3.json',JSON.stringify({identities:[{name:'tests',credentials:[{accessKey,secretKey}],actions:['Admin:legal-test','Read:legal-test','Write:legal-test','List:legal-test']}]}));
writeFileSync('.local/ci-s3/security.toml',['jwt.signing','jwt.signing.read','jwt.filer_signing','jwt.filer_signing.read'].map(k=>`[${k}]\nkey="${randomBytes(32).toString('hex')}"`).join('\n'));
const keys=['DATABASE_URL','PLATFORM_DATABASE_URL','DIRECT_DATABASE_URL','REDIS_URL','WEB_ORIGIN','INTERNAL_API_URL','API_PORT','SESSION_HOURS','MFA_ENCRYPTION_KEY','CI','LEGAL_TEST_ENV'];
const settings=Object.fromEntries(keys.map(k=>[k,process.env[k]??'']));
Object.assign(settings,{NODE_ENV:'test',S3_ENDPOINT:'http://127.0.0.1:4320',S3_REGION:'us-east-1',S3_BUCKET:'legal-test',S3_ACCESS_KEY_ID:accessKey,S3_SECRET_ACCESS_KEY:secretKey,RESEND_API_KEY:'',EMAIL_FROM:''});
writeFileSync('.env.test',Object.entries(settings).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
JS
.local/weed -config_dir=.local/ci-s3 mini -dir=.local/ci-storage -ip=127.0.0.1 -ip.bind=127.0.0.1 -s3.port=4320 -s3.config=.local/ci-s3/s3.json -bucket=legal-test -admin.ui=false -webdav=false -volume.max=4 >.local/ci-s3.log 2>&1 &
for attempt in $(seq 1 30); do
  status=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4320 || true)
  if test "$status" = 403; then echo 'Private CI object storage ready'; exit 0; fi
  sleep 1
done
echo 'CI object storage failed to start'; exit 1
