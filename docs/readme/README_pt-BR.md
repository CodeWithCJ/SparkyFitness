<p align="center">
  <a href="../../README.md">English</a> ·
  <a href="README_zh-CN.md">简体中文</a> ·
  <a href="README_zh-TW.md">繁體中文</a> ·
  <a href="README_ja.md">日本語</a> ·
  <a href="README_ko.md">한국어</a> ·
  <a href="README_hi.md">हिन्दी</a> ·
  <a href="README_th.md">ไทย</a> ·
  <a href="README_fr.md">Français</a> ·
  <a href="README_de.md">Deutsch</a> ·
  <a href="README_es.md">Español</a> ·
  <a href="README_it.md">Italiano</a> ·
  <a href="README_ru.md">Русский</a> ·
  <b>Português (Brasil)</b> ·
  <a href="README_nl.md">Nederlands</a> ·
  <a href="README_pl.md">Polski</a> ·
  <a href="README_ar.md">العربية</a> ·
  <a href="README_fa.md">فارسی</a> ·
  <a href="README_tr.md">Türkçe</a> ·
  <a href="README_vi.md">Tiếng Việt</a> ·
  <a href="README_id.md">Bahasa Indonesia</a>
</p>

# SparkyFitness

Uma alternativa auto-hospedada e focada em privacidade ao MyFitnessPal, Flo, Hevy, Shotsy e outros. Acompanhe nutrição, exercícios, medidas corporais e dados de saúde mantendo o controle total dos seus dados.
<img width="5120" height="2880" alt="imagem" src="https://github.com/user-attachments/assets/d8b09f48-cb4d-41a6-b678-ac93e551f257" />


SparkyFitness é uma plataforma auto-hospedada de acompanhamento fitness composta por:

- Um servidor backend (API + armazenamento de dados)
- Um frontend web
- Apps móveis nativos para iOS e Android

Ele armazena e gerencia dados de saúde em uma infraestrutura que você controla, sem depender de serviços de terceiros.

## Principais recursos

- Acompanhamento de nutrição, exercícios, hidratação, sono, jejum, humor e medidas corporais
- Definição de metas e check-ins diários
- Gráficos interativos e relatórios de longo prazo
- Vários perfis de usuário e acesso familiar
- Temas claro e escuro
- OIDC, TOTP, Passkey, MFA etc.

## Como o SparkyFitness se compara

**O SparkyFitness é source-available, não open source**: a [licença](../../LICENSE) é não comercial e exige permissão para uso comercial.

A maioria dos apps faz uma coisa só. Um bom app de nutrição custa de US$ 40 a US$ 100 por ano; cobrir tudo o que o SparkyFitness cobre significa três ou quatro assinaturas, por pessoa, e mesmo assim sem um relatório único que reúna tudo. O SparkyFitness faz isso em um só app, de graça, para toda a casa.

<sub>Preços de tabela nos EUA, 14 de agosto de 2026. [Detalhamento completo dos custos →](https://codewithcj.github.io/SparkyFitness/features/comparison)</sub>

| | **SparkyFitness** | wger | MyFitnessPal | Cronometer | Hevy | Zero | Flo | Garmin Connect | Google Health |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Auto-hospedado, seus dados continuam seus | ⭐ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Sem assinatura, sem anúncios | ✅ | ✅ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ✅ | 🟡 |
| Nutrição, força, sono, jejum, ciclo e medicamentos em um só lugar\* | ⭐ | 🟡 | 🟡 | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Histórico completo e relatórios com período personalizado | ✅ grátis | 🟡 | 💰 | 💰 | 💰 | 💰 | 💰 | ✅ | 💰 |
| Sincronização com wearables e plataformas de saúde | ✅ mais de 8 serviços | ❌ | ✅ | ⭐ | ✅ | 🟡 | 🟡 | 🟡 | ✅ |
| Compartilhamento familiar com permissões granulares | ⭐ 7 permissões | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | 🟡 | 🟡 |
| Importação de CSV e exportação de dados gratuita | ✅ | 🟡 | 💰 | ✅ | ✅ | 🟡 | 🟡 | 🟡 | ❌ |
| Servidor MCP + use seu próprio LLM | ⭐ | 🟡 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

⭐ destaque &nbsp;•&nbsp; ✅ suportado &nbsp;•&nbsp; 🟡 parcial &nbsp;•&nbsp; 💰 só no plano pago &nbsp;•&nbsp; ❌ não suportado

<sub>\* Fases do sono, VFC e glicemia são importadas do seu relógio, celular ou glicosímetro. O SparkyFitness armazena, analisa e exibe esses dados em gráficos, mas não os mede por conta própria.</sub>

> **Esta tabela foi escrita pelo próprio projeto que está sendo comparado, então leia com isso em mente.** Verificada em 14 de agosto de 2026 com base em documentação oficial, repositórios e páginas das lojas; parte dela já está desatualizada. Se alguma célula estiver errada ou for injusta com outro projeto, [abra uma issue](https://github.com/CodeWithCJ/SparkyFitness/issues) — correções que deixem o SparkyFitness com uma imagem *pior* são igualmente bem-vindas.

**[Veja a comparação completa →](https://codewithcj.github.io/SparkyFitness/features/comparison)** — 17 apps nas categorias auto-hospedados, nutrição, especializados e ecossistemas de dispositivos, além de onde cada um deles se sai melhor que nós.

## Integrações de saúde e dispositivos

O SparkyFitness pode sincronizar dados de várias plataformas de saúde e fitness:

- **Apple Health** (iOS)
- **Google Health Connect** (Android)
- **Google Health API** 
- **Fitbit**
- **Garmin Connect**
- **Withings**
- **Polar Flow** 
- **Oura**
- **Hevy**
- **OpenFoodFacts**
- **USDA**
- **Fatsecret**
- **Nutritionix**
- **Mealie**
- **Tandoor**
- **Strava** (parcialmente testado)
- **COROS**
- **Norish**
- **Yazio** (usa uma API não oficial)
- **Swiss Food Database**
- **Canadian Nutrient File (Health Canada)**
- **Swedish Food Agency (Livsmedelsverket)**
- **Free Exercise DB** (Github)
- **Wger**

As integrações sincronizam automaticamente com o seu servidor SparkyFitness dados de atividade como passos, treinos e sono, além de métricas de saúde como peso e medidas corporais.

## Recursos opcionais de IA (beta)

O SparkyAI oferece uma interface de conversa para registrar dados e acompanhar seu progresso.

- Registre alimentação, exercícios, dados corporais e passos pelo chat
- Envie fotos de comida para registrar refeições automaticamente
- Mantém o histórico da conversa para perguntas de acompanhamento

Observação: os recursos de IA estão atualmente em beta.

## Instalação

Escolha uma das duas formas de executar o SparkyFitness:

### 1. Auto-hospedado

Coloque um servidor SparkyFitness no ar em minutos usando Docker Compose:

```bash
# 1. Crie uma nova pasta
mkdir sparkyfitness && cd sparkyfitness

# 2. Baixe o docker-compose.yml
curl -L -o docker-compose.yml https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/docker-compose.prod.yml

# 3. Configure seu .env (escolha uma opção):
# Opção A (recomendada): gere um .env personalizado com chaves seguras em 1 clique no navegador:
# 👉 https://codewithcj.github.io/SparkyFitness/install/env-generator

# Opção B: modelo mínimo — 5 valores, todo o resto usa os padrões
# que o docker-compose já aplica. Atende à maioria das instalações auto-hospedadas.
curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.simple.example

# Opção C: referência completa — todas as variáveis suportadas, comentadas com seu
# valor padrão. Comece por aqui para SSO, SMTP, um banco de dados externo ou um proxy reverso.
# curl -L -o .env https://raw.githubusercontent.com/CodeWithCJ/SparkyFitness/main/docker/.env.example

# 4. Substitua os placeholders (pule esta etapa se você usou a Opção A — o gerador
# já os preencheu). O servidor se recusa a iniciar enquanto eles continuarem
# como estão e, caso contrário, o banco de dados seria inicializado com uma senha pública.
#   SPARKY_FITNESS_DB_PASSWORD        qualquer senha forte
#   SPARKY_FITNESS_API_ENCRYPTION_KEY openssl rand -hex 32     (64 caracteres hex)
#   BETTER_AUTH_SECRET                openssl rand -base64 32  (44 caracteres)
#   SPARKY_FITNESS_FRONTEND_URL       a URL em que você vai abrir o app

# 5. Inicie o app
docker compose pull && docker compose up -d

# Acesse o aplicativo em http://localhost:3004
```

_Observação: para todas as opções de configuração, proxies reversos e métodos alternativos de instalação, visite o [site de documentação](https://codewithcj.github.io/SparkyFitness/)._

### 2. Nuvem (para usuários não técnicos)

Se você não é um usuário técnico e prefere não executar o SparkyFitness no seu próprio servidor, pode implantar uma instância hospedada na nuvem com um dos provedores a seguir.

<a href="https://www.pikapods.com/pods?run=sparkyfitness">
  <img src="https://www.pikapods.com/static/run-button.svg" height="70" width="150" alt="Executar no PikaPods">
</a>
<br>
<a href="https://zenith.hosting/host/sparkyfitness?ref=gh">
  <img src="https://cdn.zenith.hosting/buttons/deploy-with-zenith.svg" height="70" width="150" alt="Implantar com Zenith">
</a>


> **Observação:** estes são serviços independentes de terceiros. Recomendamos que você explore os recursos oferecidos por cada provedor para descobrir qual atende melhor às suas necessidades.
 

## 🎥 Tutorial em vídeo

[![Assista ao vídeo](https://img.youtube.com/vi/B13IiL2DeQc/maxresdefault.jpg)](https://www.youtube.com/watch?v=B13IiL2DeQc)

Tutorial rápido de 2 minutos mostrando como instalar o SparkyFitness (rastreador fitness auto-hospedado).

## Documentação

Para guias de instalação completos, opções de configuração e documentação para desenvolvedores, visite nosso [site de documentação](https://codewithcj.github.io/SparkyFitness/).

### Links rápidos

- **[Guia de instalação](https://codewithcj.github.io/SparkyFitness/install/docker-compose)** - Implantação e configurações
- **[Gerador interativo de .env](https://codewithcj.github.io/SparkyFitness/install/env-generator)** - Gerador de configuração `.env` no navegador
- **[Visão geral dos recursos](https://codewithcj.github.io/SparkyFitness/features)** - Documentação completa dos recursos
- **[Fluxo de desenvolvimento](https://codewithcj.github.io/SparkyFitness/developer/getting-started)** - Guia do desenvolvedor e processo de contribuição
- **[Informações do app para iOS](https://github.com/CodeWithCJ/SparkyFitness/wiki/Apple-Health-Integration)** e **[informações do app para Android](https://github.com/CodeWithCJ/SparkyFitness/wiki/Android-Mobile-App)**

### Precisa de ajuda?

- Publique nas issues ou discussões do Github.
- Para ter respostas mais rápidas e ajuda de outros membros da comunidade, **[entre no nosso Discord](https://discord.gg/vcnMT5cPEA)**

## Histórico de estrelas

<a href="https://www.star-history.com/?repos=CodeWithCJ%2FSparkyFitness&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&theme=dark&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
   <img alt="Gráfico do histórico de estrelas" src="https://api.star-history.com/chart?repos=CodeWithCJ/SparkyFitness&type=date&legend=top-left&sealed_token=MWviIBzQInvKCol1ejXZDjNri3pRWX0dc2AWIPURcTYtRhXm-_L4OXbnWeawEjkcHYOSex4XLfBuGzfQ-W636dNfgksXVYkUHNdKLXK1HQHxuMGo53u9FmU6bnHR4mDNyjq1zcue5kbzagAjRpsFfkQ_F6hQSL92j112pU3AGXiDWk8ZCGcdrKkyAK7o" />
 </picture>
</a>

## Traduções


**[Traduções no Weblate](https://weblate.sparkyfitness.com/engage/sparkyfitness)**

<a href="http://weblate.sparkyfitness.com/engage/sparkyfitness/"><img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/svg-badge.svg" alt="Status da tradução"></a>



<a href="https://weblate.sparkyfitness.com/engage/sparkyfitness">
<img src="http://weblate.sparkyfitness.com/widget/sparkyfitness/multi-auto.svg" alt="Status da tradução" />
</a>

## Atividade do repositório

![Alt](https://repobeats.axiom.co/api/embed/828203d3070ff56c8873c727b6873b684c4ed399.svg "Imagem de análise do Repobeats")

## Contribuidores

<a href="https://github.com/CodeWithCJ/SparkyFitness/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=CodeWithCJ/SparkyFitness" width="100%" alt="Colaboradores do SparkyFitness"/>
</a>

## ⚠️ Problemas conhecidos / Recursos em beta ⚠️

O SparkyFitness está em desenvolvimento ativo.
Podem ocorrer mudanças incompatíveis entre versões.

- Não é recomendado atualizar os contêineres automaticamente
- Sempre leia as notas de versão antes de atualizar

Os recursos a seguir estão atualmente em beta e podem não ter sido testados a fundo. Esteja preparado para possíveis bugs ou funcionalidades incompletas:

- Chatbot de IA
- Acesso para família e amigos
- Documentação da API

_Esta é uma tradução do README em inglês. Em caso de divergência, a [versão em inglês](../../README.md) é a referência._
