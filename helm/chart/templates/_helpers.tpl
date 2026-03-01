{{/*
Chart name, truncated to 63 chars.
*/}}
{{- define "sparkyfitness.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Fully qualified app name, truncated to 63 chars.
*/}}
{{- define "sparkyfitness.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "sparkyfitness.labels" -}}
app.kubernetes.io/name: {{ include "sparkyfitness.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "sparkyfitness.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sparkyfitness.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* ================================================================== */}}
{{/* Image helpers                                                      */}}
{{/* ================================================================== */}}

{{/*
Build a container image string with optional global.imageRegistry prefix.
Usage: {{ include "sparkyfitness.image" (dict "image" .Values.server.image "global" .Values.global "appVersion" .Chart.AppVersion) }}
*/}}
{{- define "sparkyfitness.image" -}}
{{- $registry := .global.imageRegistry | default "" -}}
{{- $repo := .image.repository -}}
{{- $tag := .image.tag | default .appVersion -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repo $tag -}}
{{- else -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}
{{- end }}

{{/*
Render global.imagePullSecrets as a YAML list.
*/}}
{{- define "sparkyfitness.imagePullSecrets" -}}
{{- if .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- range .Values.global.imagePullSecrets }}
  - name: {{ .name }}
{{- end }}
{{- end }}
{{- end }}

{{/* ================================================================== */}}
{{/* Database helpers                                                    */}}
{{/* ================================================================== */}}

{{- define "sparkyfitness.databaseHost" -}}
{{- if .Values.postgresql.enabled -}}
{{- include "sparkyfitness.fullname" . }}-postgresql
{{- else -}}
{{- required "externalDatabase.host is required when postgresql.enabled=false" .Values.externalDatabase.host -}}
{{- end -}}
{{- end }}

{{- define "sparkyfitness.databasePort" -}}
{{- if .Values.postgresql.enabled -}}
5432
{{- else -}}
{{- .Values.externalDatabase.port | default 5432 -}}
{{- end -}}
{{- end }}

{{- define "sparkyfitness.databaseName" -}}
{{- if .Values.postgresql.enabled -}}
{{- .Values.postgresql.auth.database -}}
{{- else -}}
{{- required "externalDatabase.database is required when postgresql.enabled=false" .Values.externalDatabase.database -}}
{{- end -}}
{{- end }}

{{/* ================================================================== */}}
{{/* Secret name helpers (per type)                                     */}}
{{/* ================================================================== */}}

{{/*
App secret name: existingSecret > chart-managed.
*/}}
{{- define "sparkyfitness.appSecretName" -}}
{{- if .Values.server.secrets.existingSecret -}}
{{- .Values.server.secrets.existingSecret -}}
{{- else -}}
{{- include "sparkyfitness.fullname" . }}-app
{{- end -}}
{{- end }}

{{/*
OIDC secret name: existingSecret > chart-managed.
*/}}
{{- define "sparkyfitness.oidcSecretName" -}}
{{- if .Values.config.oidc.secrets.existingSecret -}}
{{- .Values.config.oidc.secrets.existingSecret -}}
{{- else -}}
{{- include "sparkyfitness.fullname" . }}-oidc
{{- end -}}
{{- end }}

{{/*
SMTP secret name: existingSecret > chart-managed.
*/}}
{{- define "sparkyfitness.smtpSecretName" -}}
{{- if .Values.config.email.secrets.existingSecret -}}
{{- .Values.config.email.secrets.existingSecret -}}
{{- else -}}
{{- include "sparkyfitness.fullname" . }}-smtp
{{- end -}}
{{- end }}

{{/*
App database secret name (limited-privilege user): existingSecret > chart-managed.
*/}}
{{- define "sparkyfitness.appDbSecretName" -}}
{{- if .Values.server.appDatabase.existingSecret -}}
{{- .Values.server.appDatabase.existingSecret -}}
{{- else -}}
{{- include "sparkyfitness.fullname" . }}-appdb
{{- end -}}
{{- end }}

{{/*
Database credentials secret name.
Resolves: postgresql.auth or externalDatabase.auth → existingSecret > chart-managed.
*/}}
{{- define "sparkyfitness.databaseSecretName" -}}
{{- $dbAuth := .Values.externalDatabase.auth -}}
{{- if .Values.postgresql.enabled -}}
  {{- $dbAuth = .Values.postgresql.auth -}}
{{- end -}}
{{- if $dbAuth.existingSecret -}}
  {{- $dbAuth.existingSecret -}}
{{- else -}}
  {{- include "sparkyfitness.fullname" . }}-postgres
{{- end -}}
{{- end }}

{{/* ================================================================== */}}
{{/* Secret creation helpers                                            */}}
{{/* ================================================================== */}}

{{/*
Whether the chart should create the app secret.
*/}}
{{- define "sparkyfitness.createAppSecret" -}}
{{- if and (not .Values.server.secrets.existingSecret) (not (and .Values.externalSecrets.enabled .Values.externalSecrets.app.enabled)) -}}
true
{{- end -}}
{{- end }}

{{/*
Whether the chart should create the app database secret.
*/}}
{{- define "sparkyfitness.createAppDbSecret" -}}
{{- if and (not .Values.server.appDatabase.existingSecret) (not (and .Values.externalSecrets.enabled .Values.externalSecrets.appdb.enabled)) -}}
true
{{- end -}}
{{- end }}

{{/*
Whether the chart should create the OIDC secret.
*/}}
{{- define "sparkyfitness.createOidcSecret" -}}
{{- if and .Values.config.oidc.enabled (not .Values.config.oidc.secrets.existingSecret) -}}
  {{- if not (and .Values.externalSecrets.enabled .Values.externalSecrets.oidc.enabled) -}}
true
  {{- end -}}
{{- end -}}
{{- end }}

{{/*
Whether the chart should create the SMTP secret.
*/}}
{{- define "sparkyfitness.createSmtpSecret" -}}
{{- if and .Values.config.email.enabled (not .Values.config.email.secrets.existingSecret) -}}
  {{- if not (and .Values.externalSecrets.enabled .Values.externalSecrets.smtp.enabled) -}}
true
  {{- end -}}
{{- end -}}
{{- end }}

{{/*
Whether the chart should create the database credentials secret.
*/}}
{{- define "sparkyfitness.createDatabaseSecret" -}}
{{- $dbAuth := .Values.externalDatabase.auth -}}
{{- if .Values.postgresql.enabled -}}
  {{- $dbAuth = .Values.postgresql.auth -}}
{{- end -}}
{{- if and (not $dbAuth.existingSecret) (not (and .Values.externalSecrets.enabled .Values.externalSecrets.postgres.enabled)) -}}
true
{{- end -}}
{{- end }}

{{/* ================================================================== */}}
{{/* URL helpers                                                        */}}
{{/* ================================================================== */}}

{{/*
Frontend URL — derived from routing config, with manual fallback.
Priority: httpRoute > ingress > config.frontendUrl > localhost
*/}}
{{- define "sparkyfitness.frontendUrl" -}}
{{- if and .Values.httpRoute.enabled .Values.httpRoute.hostname -}}
https://{{ .Values.httpRoute.hostname }}
{{- else if and .Values.ingress.enabled (gt (len .Values.ingress.hosts) 0) -}}
{{- $host := (index .Values.ingress.hosts 0).host -}}
{{- if .Values.ingress.tls -}}
https://{{ $host }}
{{- else -}}
http://{{ $host }}
{{- end -}}
{{- else if .Values.config.frontendUrl -}}
{{- .Values.config.frontendUrl -}}
{{- else -}}
{{- /* 3004 is the SparkyFitness server's default development port */ -}}
http://localhost:3004
{{- end -}}
{{- end }}

{{/* ================================================================== */}}
{{/* ConfigMap helpers                                                   */}}
{{/* ================================================================== */}}

{{- define "sparkyfitness.configmapName" -}}
{{- include "sparkyfitness.fullname" . }}-server-config
{{- end }}

{{/* ================================================================== */}}
{{/* StorageClass helper                                                */}}
{{/* ================================================================== */}}

{{/*
Effective StorageClass — component-level > global > cluster default.
Usage: {{ include "sparkyfitness.storageClass" (dict "sc" .Values.postgresql.persistence.storageClass "global" .Values.global) }}
*/}}
{{- define "sparkyfitness.storageClass" -}}
{{- $sc := .sc | default "" -}}
{{- $globalSc := .global.storageClass | default "" -}}
{{- if $sc -}}
{{- $sc -}}
{{- else if $globalSc -}}
{{- $globalSc -}}
{{- end -}}
{{- end }}
