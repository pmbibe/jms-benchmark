# Use openjdk:7u151 as base image for Java 7
FROM openjdk:7u151


# Set environment variables
ENV SERVER_SETUP=false \
    SERVER_ADDRESS={activemq-endpoint} \
    ACTIVEMQ_TRANSPORT=ssl \
    ACTIVEMQ_PORT=61617 \
    ACTIVEMQ_USERNAME={activemq-user} \
    ACTIVEMQ_PASSWORD={activemq-password}

# Copy benchmark scripts and resources
COPY jms-benchmark-master /app

# Set executable permissions for the script
RUN chmod a+x /app/bin/*

# Set working directory
WORKDIR /app

# Run the benchmark script

CMD ["/bin/bash", "-c", "./bin/benchmark-activemq"]

