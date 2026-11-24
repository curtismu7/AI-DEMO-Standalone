outputs:
  es_siem:
    type: elastic
    url: '__ES_URL__'
    index: ping-siem-events-v2
    # The ingestion user may only write, so Cribl's startup 'GET /' version check is refused (401). Name the version instead.
    elasticVersion: '7'
    authType: basic
    username: '__OUT_USER__'
    password: '__OUT_PASS__'
  # Gateway events. Elasticsearch gets them in phase 1; OpenSearch is switched on (GW_OPENSEARCH=true) at the cut-over, when the sidecar
  # stops posting to OpenSearch itself, so the same event is never written there twice.
  es_gateway:
    type: elastic
    url: '__ES_URL__'
    index: gateway-events
    elasticVersion: '7'
    authType: basic
    username: '__OUT_USER__'
    password: '__OUT_PASS__'
  os_gateway:
    type: elastic
    url: '__OS_URL__'
    index: gateway-events
    elasticVersion: '7'
    authType: none
  gw_router:
    type: router
    rules:
      - filter: "true"
        output: es_gateway
        final: false
        description: Elasticsearch gateway-events
      - filter: "__GW_OPENSEARCH__"
        output: os_gateway
        final: false
        description: OpenSearch gateway-events (off until the cut-over)
  devnull:
    type: devnull
