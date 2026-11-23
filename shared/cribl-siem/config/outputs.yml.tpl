outputs:
  es_siem:
    type: elastic
    url: '__ES_URL__'
    index: ping-siem-events
    # The ingestion user may only write, so Cribl's startup 'GET /' version check is refused (401). Name the version instead.
    elasticVersion: '7'
    authType: basic
    username: '__OUT_USER__'
    password: '__OUT_PASS__'
  devnull:
    type: devnull
