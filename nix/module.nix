# NixOS module for SparkyFitness.
#
# Runs the backend API as a systemd service, optionally provisions a local
# PostgreSQL database, and serves the statically built frontend through nginx
# with the same reverse-proxy routes the Docker deployment uses
# (/api, /health-data -> /api/health-data, /uploads).
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.sparkyfitness;

  # Non-secret runtime environment derived from the module options. Secrets
  # (passwords, encryption key, auth secret) come from cfg.environmentFile.
  baseEnv = {
    NODE_ENV = "production";
    SPARKY_FITNESS_SERVER_PORT = toString cfg.port;
    SPARKY_FITNESS_DB_HOST = cfg.database.host;
    SPARKY_FITNESS_DB_PORT = toString cfg.database.port;
    SPARKY_FITNESS_DB_NAME = cfg.database.name;
    SPARKY_FITNESS_DB_USER = cfg.database.user;
    SPARKY_FITNESS_APP_DB_USER = cfg.database.appUser;
    SPARKY_FITNESS_FRONTEND_URL = cfg.frontendUrl;
    SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = "${cfg.stateDir}/uploads";
    SPARKY_FITNESS_CUSTOM_BACKUP_DIRECTORY = "${cfg.stateDir}/backup";
    SPARKY_FITNESS_CUSTOM_TEMP_DIRECTORY = "${cfg.stateDir}/temp_uploads";
    SPARKY_FITNESS_LOG_LEVEL = cfg.logLevel;
  }
  // cfg.extraEnvironment;
in
{
  options.services.sparkyfitness = {
    enable = lib.mkEnableOption "the SparkyFitness self-hosted fitness tracker";

    backendPackage = lib.mkOption {
      type = lib.types.package;
      description = "The SparkyFitness backend server package.";
    };

    frontendPackage = lib.mkOption {
      type = lib.types.package;
      description = "The built SparkyFitness frontend static assets.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "sparkyfitness";
      description = "User account under which the backend runs.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "sparkyfitness";
      description = "Group under which the backend runs.";
    };

    stateDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/sparkyfitness";
      description = "Directory for persistent state (uploads and backups).";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3010;
      description = "Port the backend API listens on.";
    };

    frontendUrl = lib.mkOption {
      type = lib.types.str;
      example = "https://fitness.example.com";
      description = ''
        Public URL of the frontend. Used for CORS and Better Auth trusted
        origins. Must match how users reach the site.
      '';
    };

    logLevel = lib.mkOption {
      type = lib.types.enum [
        "DEBUG"
        "INFO"
        "WARN"
        "ERROR"
        "SILENT"
      ];
      default = "INFO";
      description = "Backend log verbosity.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/sparkyfitness.env";
      description = ''
        Path to an EnvironmentFile (systemd format) holding secret values that
        should not live in the Nix store. At minimum this should set:

          SPARKY_FITNESS_DB_PASSWORD
          SPARKY_FITNESS_APP_DB_PASSWORD
          SPARKY_FITNESS_API_ENCRYPTION_KEY
          BETTER_AUTH_SECRET

        When `database.createLocally` is true, SPARKY_FITNESS_DB_PASSWORD is also
        used to provision the local PostgreSQL owner role.
      '';
    };

    extraEnvironment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = {
        SPARKY_FITNESS_DISABLE_SIGNUP = "true";
      };
      description = "Additional environment variables passed to the backend.";
    };

    database = {
      createLocally = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Provision a local PostgreSQL server, owner role and database. Disable
          to point at an external PostgreSQL instance via the options below.
        '';
      };

      package = lib.mkOption {
        type = lib.types.package;
        default = pkgs.postgresql_16;
        defaultText = lib.literalExpression "pkgs.postgresql_16";
        description = ''
          PostgreSQL package used when `createLocally` is true. Must be
          PostgreSQL 15 or newer: the migrations use `UNIQUE NULLS NOT
          DISTINCT`, which earlier versions reject with a syntax error near
          "NULLS".
        '';
      };

      host = lib.mkOption {
        type = lib.types.str;
        default = "127.0.0.1";
        description = "PostgreSQL host.";
      };

      port = lib.mkOption {
        type = lib.types.port;
        default = 5432;
        description = "PostgreSQL port.";
      };

      name = lib.mkOption {
        type = lib.types.str;
        default = "sparkyfitness_db";
        description = "Database name.";
      };

      user = lib.mkOption {
        type = lib.types.str;
        default = "sparky";
        description = ''
          Privileged database role used for migrations. It must be able to
          CREATE ROLE because the backend creates the application role on
          startup.
        '';
      };

      appUser = lib.mkOption {
        type = lib.types.str;
        default = "sparky_app";
        description = ''
          Limited application role. Created automatically by the backend at
          startup using SPARKY_FITNESS_APP_DB_PASSWORD.
        '';
      };
    };

    nginx = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Serve the frontend and reverse-proxy the API through nginx.";
      };

      virtualHost = lib.mkOption {
        type = lib.types.str;
        default = "localhost";
        description = "nginx virtual host name for the frontend.";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.environmentFile != null;
        message = "services.sparkyfitness.environmentFile must be set with the required secrets.";
      }
    ];

    users.users = lib.mkIf (cfg.user == "sparkyfitness") {
      sparkyfitness = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.stateDir;
      };
    };

    users.groups = lib.mkIf (cfg.group == "sparkyfitness") {
      sparkyfitness = { };
    };

    # --- Local PostgreSQL -----------------------------------------------------
    services.postgresql = lib.mkIf cfg.database.createLocally {
      enable = lib.mkDefault true;
      # Pin the major version (>= 15 for `UNIQUE NULLS NOT DISTINCT`) instead of
      # the stateVersion-derived default, which can be too old. Override via
      # `services.sparkyfitness.database.package`.
      package = cfg.database.package;
      # The database itself is created by the sparkyfitness-db-init service so
      # it can be owned by the password-authenticated owner role. Using
      # `ensureDatabases` here would race with that service.
      authentication = lib.mkAfter ''
        # Allow the SparkyFitness owner role to connect over TCP with a password.
        host ${cfg.database.name} ${cfg.database.user} 127.0.0.1/32 md5
        host ${cfg.database.name} ${cfg.database.user} ::1/128 md5
        host ${cfg.database.name} ${cfg.database.appUser} 127.0.0.1/32 md5
        host ${cfg.database.name} ${cfg.database.appUser} ::1/128 md5
      '';
    };

    # Provision the owner role + password and hand the database over to it.
    # The backend itself creates the limited application role at startup.
    systemd.services.sparkyfitness-db-init = lib.mkIf cfg.database.createLocally {
      description = "SparkyFitness database initialisation";
      after = [ "postgresql.service" ];
      requires = [ "postgresql.service" ];
      wantedBy = [ "multi-user.target" ];
      before = [ "sparkyfitness.service" ];
      serviceConfig = {
        Type = "oneshot";
        User = "postgres";
        Group = "postgres";
        RemainAfterExit = true;
        EnvironmentFile = cfg.environmentFile;
      };
      path = [ config.services.postgresql.package ];
      script = ''
        set -euo pipefail
        # Create/Update the privileged owner role with a login password and the
        # CREATEROLE privilege the backend needs to provision the app role.
        if psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${cfg.database.user}'" | grep -q 1; then
          psql -c "ALTER ROLE \"${cfg.database.user}\" WITH LOGIN CREATEROLE PASSWORD '$SPARKY_FITNESS_DB_PASSWORD'"
        else
          psql -c "CREATE ROLE \"${cfg.database.user}\" WITH LOGIN CREATEROLE PASSWORD '$SPARKY_FITNESS_DB_PASSWORD'"
        fi

        # Create the database owned by that role if it does not exist yet.
        # CREATE DATABASE cannot run inside a transaction, so guard it instead.
        if ! psql -tAc "SELECT 1 FROM pg_database WHERE datname='${cfg.database.name}'" | grep -q 1; then
          psql -c "CREATE DATABASE \"${cfg.database.name}\" OWNER \"${cfg.database.user}\""
        else
          psql -c "ALTER DATABASE \"${cfg.database.name}\" OWNER TO \"${cfg.database.user}\""
        fi

        # Hand the public schema to the owner role. Modern PostgreSQL leaves
        # `public` owned by the bootstrap superuser even after the database
        # owner changes, which breaks migrations that run e.g.
        # `COMMENT ON SCHEMA public`.
        psql -d "${cfg.database.name}" -c "ALTER SCHEMA public OWNER TO \"${cfg.database.user}\""
      '';
    };

    # --- Backend service ------------------------------------------------------
    systemd.services.sparkyfitness = {
      description = "SparkyFitness backend API server";
      wantedBy = [ "multi-user.target" ];
      after = [
        "network.target"
      ]
      ++ lib.optionals cfg.database.createLocally [
        "postgresql.service"
        "sparkyfitness-db-init.service"
      ];
      requires = lib.optionals cfg.database.createLocally [
        "sparkyfitness-db-init.service"
      ];

      environment = baseEnv;

      serviceConfig = {
        ExecStart = lib.getExe cfg.backendPackage;
        User = cfg.user;
        Group = cfg.group;
        EnvironmentFile = cfg.environmentFile;
        StateDirectory = lib.mkIf (lib.hasPrefix "/var/lib/" cfg.stateDir) (
          lib.removePrefix "/var/lib/" cfg.stateDir
        );
        WorkingDirectory = cfg.stateDir;
        Restart = "on-failure";
        RestartSec = 5;

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        ReadWritePaths = [ cfg.stateDir ];
      };

      preStart = ''
        mkdir -p ${cfg.stateDir}/uploads ${cfg.stateDir}/backup ${cfg.stateDir}/temp_uploads
      '';
    };

    # --- nginx frontend + reverse proxy --------------------------------------
    services.nginx = lib.mkIf cfg.nginx.enable {
      enable = lib.mkDefault true;
      recommendedGzipSettings = lib.mkDefault true;
      recommendedProxySettings = lib.mkDefault true;

      virtualHosts.${cfg.nginx.virtualHost} = {
        root = cfg.frontendPackage;

        locations = {
          # Static SPA with client-side routing.
          "/" = {
            tryFiles = "$uri $uri/ /index.html";
            extraConfig = ''
              expires -1;
              add_header Cache-Control "no-cache, no-store, must-revalidate";
            '';
          };

          "/assets/" = {
            extraConfig = ''
              expires 1y;
              add_header Cache-Control "public, no-transform, immutable";
              try_files $uri =404;
            '';
          };

          # API reverse proxy.
          "^~ /api/" = {
            proxyPass = "http://127.0.0.1:${toString cfg.port}";
          };

          # Mobile/health-data clients hit /health-data, backend serves it under /api.
          "/health-data" = {
            proxyPass = "http://127.0.0.1:${toString cfg.port}/api/health-data";
          };

          # Uploaded files are served by the backend.
          "^~ /uploads/" = {
            proxyPass = "http://127.0.0.1:${toString cfg.port}/uploads/";
          };

          # External MCP endpoint (JSON-RPC over StreamableHTTP). Buffering off
          # and the keep-alive Connection header cleared so text/event-stream
          # responses stream to the client.
          "^~ /mcp" = {
            proxyPass = "http://127.0.0.1:${toString cfg.port}";
            extraConfig = ''
              proxy_http_version 1.1;
              proxy_set_header Connection "";
              proxy_buffering off;
            '';
          };
        };

        extraConfig = ''
          client_max_body_size 10m;
          proxy_read_timeout 300s;
          proxy_send_timeout 300s;
        '';
      };
    };
  };
}
