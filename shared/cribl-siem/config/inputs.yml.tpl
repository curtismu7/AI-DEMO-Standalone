inputs:
  in_elastic:
    type: elastic
    disabled: false
    host: 0.0.0.0
    port: 9200
    elasticAPI: /
    authType: basic
    username: '__IN_USER__'
    password: '__IN_PASS__'
    tls:
      disabled: true
    proxyMode:
      enabled: false
