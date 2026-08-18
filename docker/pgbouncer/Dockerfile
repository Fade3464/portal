FROM postgres:16-alpine

RUN apk add --no-cache pgbouncer su-exec

COPY docker/pgbouncer/entrypoint.sh /usr/local/bin/aims-pgbouncer-entrypoint
RUN chmod 0755 /usr/local/bin/aims-pgbouncer-entrypoint

ENTRYPOINT ["/usr/local/bin/aims-pgbouncer-entrypoint"]
CMD ["pgbouncer", "/etc/pgbouncer/pgbouncer.ini"]
