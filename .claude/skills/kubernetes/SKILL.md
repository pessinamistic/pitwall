---
name: kubernetes
description: >-
  Conventions for deploying and operating services on Kubernetes in this
  stack — namespace scheme, resource requests/limits, probe wiring against
  Spring Actuator health groups, config vs secret handling, rollout
  strategy, and autoscaling. Use whenever writing or reviewing a
  Deployment/Helm chart, debugging a failed rollout, or scaling a service.
metadata:
  layer: infra
---

## When to use this

Writing or changing a Deployment/Helm chart/kustomize overlay, debugging a
pod that won't become ready, or tuning autoscaling/resource limits. Assumes
`spring-boot`'s actuator conventions for probe wiring.

## Conventions

- **Namespace scheme:** `<env>-<team>`, e.g. `prod-payments`,
  `staging-payments`. One namespace per team per environment, not one
  namespace per service — services within a team share a namespace and are
  distinguished by name/labels.
  <!-- CUSTOMIZE: replace with the real namespace convention if this org
  uses a different scheme (e.g. per-service namespaces, per-cluster envs) -->
- **Resource requests and limits are mandatory** on every container, sized
  from observed usage (via the metrics stack), not guessed. `requests` set
  the scheduling floor; `limits.memory` equals `requests.memory` (no
  memory overcommit — OOM-killed pods from bursting are worse than a
  slightly bigger request). CPU `limits` may exceed `requests` modestly to
  allow bursting.
- **Probes are wired to Spring Actuator's split health groups**
  (see `spring-boot` skill): `readinessProbe` hits
  `/actuator/health/readiness`, `livenessProbe` hits
  `/actuator/health/liveness`, and a `startupProbe` with a generous
  `failureThreshold` covers slow JVM/Spring context startup so the liveness
  probe doesn't kill a pod that's merely still booting.
- **ConfigMaps hold non-secret configuration**; secrets are never stored as
  plain Kubernetes `Secret` manifests checked into the repo — they're
  synced at deploy time from the org's secret store via an operator.
  <!-- CUSTOMIZE: name the actual secret mechanism, e.g. External Secrets
  Operator pulling from Vault/AWS Secrets Manager, and where the
  SecretStore/ClusterSecretStore resource is defined -->
- **Rollout strategy is `RollingUpdate` with `maxUnavailable: 0`,
  `maxSurge: 1`** for anything serving live traffic — a deploy never drops
  below full capacity. Combined with the readiness probe, this is what
  makes deploys safe to run during business hours.
- **Autoscaling via HPA** on CPU utilization as the baseline signal, with a
  custom metric (e.g. Kafka consumer lag, queue depth) added for
  consumer-heavy services where CPU alone under-signals load.
- **Chart structure: Helm**, one chart per service under
  `deploy/helm/<service>`, environment differences expressed as
  `values-<env>.yaml` overlays, not forked templates.
  <!-- CUSTOMIZE: if this org uses kustomize instead of Helm, swap the
  tool and directory convention here -->

## Patterns to follow

- Every Deployment carries standard labels (`app.kubernetes.io/name`,
  `.../version`, `team`) so cluster-wide tooling (cost reporting, alert
  routing) can attribute a pod without special-casing.
- `PodDisruptionBudget` with `minAvailable` set alongside every Deployment
  that has more than one replica, so voluntary disruptions (node drains,
  cluster upgrades) can't take a service below quorum.
- Config changes that only affect a ConfigMap still go through a rolling
  restart (`kubectl rollout restart`) rather than relying on the app to
  hot-reload, unless the app explicitly supports and is tested for
  hot-reload of that value.

## Common mistakes

- Shipping a Deployment with no resource requests/limits — it schedules
  fine in a quiet cluster and then causes noisy-neighbor incidents under
  load.
- Pointing the liveness probe at a deep health check (e.g. one that pings
  the database) — a slow downstream dependency then causes Kubernetes to
  kill and restart a perfectly healthy pod, amplifying an outage.
- Setting `maxUnavailable` above 0 for a user-facing service "to deploy
  faster" — this drops capacity during every deploy.
- Storing a real secret value in a `values.yaml` or a plain `Secret`
  manifest committed to git.
- Scaling purely on CPU for a Kafka consumer service, so a consumer with
  growing lag but low CPU never triggers a scale-up.

## How to verify

```bash
# Lint and render the chart before applying
helm lint deploy/helm/orders-service
helm template deploy/helm/orders-service -f deploy/helm/orders-service/values-staging.yaml

# Apply and watch the rollout complete cleanly
kubectl -n staging-payments apply -f deploy/helm/orders-service/rendered.yaml
kubectl -n staging-payments rollout status deployment/orders-service

# Confirm probes are passing and resources are set
kubectl -n staging-payments get pods -l app.kubernetes.io/name=orders-service
kubectl -n staging-payments describe pod <pod> | grep -A5 'Limits\|Liveness\|Readiness'

# Roll back if a deploy is bad
kubectl -n staging-payments rollout undo deployment/orders-service
```
