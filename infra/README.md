# infra/ — one-time bootstrap for CI/CD

The day-to-day stacks are `template.yaml` (ingest/data, us-west-2) and
`site-template.yaml` (site, us-east-1). This folder holds infra you deploy **once**.

## `github-oidc.yaml` — GitHub Actions OIDC + deploy role

Lets GitHub Actions deploy to AWS with **no long-lived keys in GitHub**. Actions on
`main` mint a short-lived OIDC token and assume `arn:aws:iam::648581682379:role/havasu-github-deploy`.
The role's trust is locked to `repo:cwoskoski/havasulakeweather:ref:refs/heads/main`, so
only this repo's `main` branch can assume it. That ARN is already referenced in
`.github/workflows/deploy.yml`.

### Deploy it (once) — this IS an AWS change, so it's gated on approval

```bash
# If the account has NO GitHub OIDC provider yet (first time):
aws cloudformation deploy \
  --template-file infra/github-oidc.yaml \
  --stack-name havasu-github-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --profile havasu --region us-east-1

# If a token.actions.githubusercontent.com provider ALREADY exists in the account,
# reuse it instead of creating a duplicate (creation would fail):
aws iam list-open-id-connect-providers --profile havasu   # find its ARN
aws cloudformation deploy \
  --template-file infra/github-oidc.yaml \
  --stack-name havasu-github-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides CreateOIDCProvider=false ExistingOIDCProviderArn=<arn> \
  --profile havasu --region us-east-1
```

Region doesn't matter (IAM is global); us-east-1 is fine. `CAPABILITY_NAMED_IAM`
is required because the role has a fixed name (`havasu-github-deploy`).

### After it's created

Nothing else to wire up — the role ARN is already in `deploy.yml`. Push/merge to
`main` and the **Deploy** workflow runs (site job if `web/` changed, ingest job if
`ingest/src`/`template.yaml`/`samconfig.toml` changed).

### If a deploy fails with `AccessDenied`

The role's inline policy is scoped (see the file). SAM occasionally needs an action
that isn't listed yet — add the specific `Action` to the relevant `Sid` and redeploy
this stack. As a quick unblock you can temporarily attach `PowerUserAccess` +
`IAMFullAccess`, but prefer adding the one missing action to keep least-privilege.

## How the NoEcho secrets stay safe

The station PASSKEY and WU read key are **NoEcho** SAM params. They live only in the
deployed read Lambda's env. The deploy workflow reads them back
(`aws lambda get-function-configuration ... STATION_KEY / WU_API_KEY`) and passes them
to `sam deploy --parameter-overrides`, so a redeploy never resets them and the secrets
never touch GitHub. The role can read them via `lambda:GetFunctionConfiguration` on
`havasu-weather-*` only.
