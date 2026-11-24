inputs:
  in_elastic:
    type: elastic
    disabled: false
    host: 127.0.0.1
    port: 9201
    elasticAPI: /
    authType: none
    tls:
      disabled: true
    proxyMode:
      enabled: false
  in_gateway:
    type: http
    disabled: false
    host: 127.0.0.1
    port: 10080
    authType: none
    criblAPI: /cribl
    elasticAPI: /elastic
    splunkHecAPI: /services/collector
    tls:
      disabled: true
