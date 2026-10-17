import net from "node:net";
net
  .createServer((socket) => {
    const target = net.connect(3010, "affine");
    socket.pipe(target);
    target.pipe(socket);
    socket.on("error", () => target.destroy());
    target.on("error", () => socket.destroy());
    socket.on("close", () => target.destroy());
    target.on("close", () => socket.destroy());
  })
  .listen(3010, "0.0.0.0");
