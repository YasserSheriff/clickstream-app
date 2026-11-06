# Cassandra for OpenShift's restricted SCC.
# OpenShift starts the container with a random non-root UID and GID 0. The upstream launcher
# rejects any process whose group is root, so we pass -R (the UID is still non-root), and give
# group 0 the same access as the owner on every path Cassandra writes to.
FROM cassandra:4.1

RUN mkdir -p /var/lib/cassandra /var/log/cassandra \
 && chgrp -R 0 /etc/cassandra /var/lib/cassandra /var/log/cassandra \
 && chmod -R g=u /etc/cassandra /var/lib/cassandra /var/log/cassandra

ENV CASSANDRA_DC=datacenter1 \
    CASSANDRA_RACK=rack1 \
    MAX_HEAP_SIZE=512M \
    HEAP_NEWSIZE=128M

USER 999
CMD ["cassandra", "-f", "-R"]
