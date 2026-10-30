::: warning
**Community Contribution:** The Kubernetes and Helm chart support are community-provided. The SparkyFitness maintainers do not currently use Kubernetes and cannot provide full review or official support for this installation method.
:::
## Quick Start (Kubernetes)

Deploy SparkyFitness on Kubernetes using the Helm chart directly from the repository.

```bash
# 1. Install with default settings (bundled PostgreSQL, no ingress)
helm install sparkyfitness oci://ghcr.io/codewithcj/charts/sparkyfitness

# -- OR install directly from source --
git clone https://github.com/CodeWithCJ/SparkyFitness.git
helm install sparkyfitness ./SparkyFitness/helm/chart

# 2. (Optional) Customize values
helm install sparkyfitness ./SparkyFitness/helm/chart -f my-values.yaml

# 3. Access the application in browser via Ingress or HTTPRoute you've specified in values
```

For all configuration options (external database, ingress, OIDC, email, etc.) see the [Helm chart README](https://github.com/CodeWithCJ/SparkyFitness/blob/main/helm/README.md).

To run more than one server replica, read [Running Multiple Instances](./multiple-instances.md) first: replicas above 1 need `ReadWriteMany` volumes for uploads and backups.

## Flux

Flux can install the chart straight from its OCI registry, with no Helm repository to add. Create the `sparkyfitness` namespace first, then apply:

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: OCIRepository
metadata:
  name: sparkyfitness
  namespace: sparkyfitness
spec:
  interval: 1h
  url: oci://ghcr.io/codewithcj/charts/sparkyfitness
  ref:
    tag: 1.11.0 # the release to run; bump it to upgrade
  # Pick the chart layer explicitly; the artifact can also carry a provenance layer.
  layerSelector:
    mediaType: application/vnd.cncf.helm.chart.content.v1.tar+gzip
    operation: copy
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: sparkyfitness
  namespace: sparkyfitness
spec:
  interval: 1h
  chartRef:
    kind: OCIRepository
    name: sparkyfitness
  values: {} # same values as helm install -f my-values.yaml
```

Flux renders the chart with cluster access, so chart-generated secrets stay the same across upgrades.
