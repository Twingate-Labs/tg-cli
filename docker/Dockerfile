FROM denoland/deno:1.27.2
COPY tg.bundle.js /
RUN chmod +x /tg.bundle.js
ENTRYPOINT ["/tg.bundle.js"]
CMD [ "--help" ]