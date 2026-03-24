import jwt from "jsonwebtoken";
import challengeRepository from "../repository/challenge.repository.js";

const authenticateSocket = (token) => {
  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (error) {
    return null;
  }
};

export const setupChallengeSocket = (io) => {
  const challengeNamespace = io.of("/challenge");

  challengeNamespace.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");
    if (!token) return next(new Error("Authentication error: No token provided"));

    const user = authenticateSocket(token);
    if (!user || user.userType !== "Student") {
      return next(new Error("Authentication error: Only students can access challenge rooms"));
    }
    socket.user = user;
    next();
  });

  challengeNamespace.on("connection", (socket) => {
    const studentId = socket.user._id?.toString?.();
    if (studentId) socket.join(`student:${studentId}`);

    socket.on("join_challenge_room", async (roomCode) => {
      try {
        if (!roomCode) return socket.emit("error", { message: "roomCode is required" });
        const challenge = await challengeRepository.findOne({ roomCode });
        if (!challenge) return socket.emit("error", { message: "Challenge room not found" });

        socket.join(`challenge:${roomCode}`);
        socket.emit("joined_challenge_room", {
          challengeId: challenge._id,
          roomCode: challenge.roomCode,
          roomStatus: challenge.roomStatus,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });
  });

  return challengeNamespace;
};

export default {
  setupChallengeSocket,
};
