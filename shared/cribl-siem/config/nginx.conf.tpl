# Auth front for Cribl, in the same pod. Privilege's SIEM form can sign in two ways: Username and password (Authorization: Basic ...)
# or API key (Authorization: ApiKey ...). Cribl's Elasticsearch source takes only one auth mode and refuses the ApiKey scheme,
# so nginx checks both here and Cribl listens on 127.0.0.1 only, with no auth of its own.
# __BASIC__ and __APIKEY__ are filled in by render-config.sh from the Secrets (never in git).
# The credential strings are longer than nginx's default 64-byte map bucket.
map_hash_bucket_size 512;
map $http_authorization $siem_authed {
    default                  0;
    "Basic __BASIC__"        1;
    "ApiKey __APIKEY__"      1;
}

# The gateways' log-tailer sidecars post one JSON line per event to /<index>/_doc with their own Basic login
# (Secret cribl-siem-gateway-login). That login works on that path only; the Privilege credentials above work everywhere else.
map $http_authorization $gw_authed {
    default                  0;
    "Basic __GWBASIC__"      1;
}

server {
    listen 9200;
    client_max_body_size 20m;

    # Gateway events: Cribl's own Elasticsearch source refuses single-document writes, so rewrite to its NDJSON HTTP source.
    location ~ ^/[^/]+/_doc/?$ {
        limit_except POST { deny all; }
        if ($gw_authed = 0) {
            add_header Content-Type application/json always;
            return 401 '{"message":"Access denied"}';
        }
        proxy_set_header Authorization "";
        proxy_set_header Content-Type application/json;
        proxy_http_version 1.1;
        rewrite ^ /cribl/_bulk break;
        proxy_pass http://127.0.0.1:10080;
    }

    location / {
        if ($siem_authed = 0) {
            add_header Content-Type application/json always;
            return 401 '{"message":"Access denied"}';
        }
        proxy_set_header Authorization "";
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_pass http://127.0.0.1:9201;
    }
}
