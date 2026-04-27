import jwt from "jsonwebtoken";
import supportService from "../services/support.service.js";
import supportTicketRepository from "../repository/supportTicket.repository.js";
import supportMessageRepository from "../repository/supportMessage.repository.js";
import { normalizeSocketAuthToken } from "./socketAuth.util.js";

/**
 * Authenticate socket connection using JWT
 */
const authenticateSocket = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
};

/**
 * Setup support socket handlers
 */
export const setupSupportSocket = (io) => {
  // Namespace for support chat
  const supportNamespace = io.of("/support");

  supportNamespace.use((socket, next) => {
    const token = normalizeSocketAuthToken(
      socket.handshake.auth?.token || socket.handshake.headers?.authorization || ""
    );

    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const user = authenticateSocket(token);
    if (!user) {
      return next(new Error("Authentication error: Invalid token"));
    }

    socket.user = user;
    next();
  });

  supportNamespace.on("connection", (socket) => {
    const userId = socket.user._id;
    const userType = socket.user.userType || "User";

    console.log(`User ${userId} (${userType}) connected to support socket`);

    // Join ticket room
    socket.on("join_ticket", async (ticketId) => {
      try {
        // Verify user has access to this ticket
        const ticket = await supportService.getTicketById(ticketId, userId, userType);
        
        // Join the ticket room
        socket.join(`ticket:${ticketId}`);
        
        // Mark messages as read when joining
        await supportMessageRepository.markTicketMessagesAsRead(ticketId, userId, userType);

        socket.emit("joined_ticket", { ticketId, ticket });
        console.log(`User ${userId} joined ticket ${ticketId}`);
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Leave ticket room
    socket.on("leave_ticket", (ticketId) => {
      socket.leave(`ticket:${ticketId}`);
      socket.emit("left_ticket", { ticketId });
      console.log(`User ${userId} left ticket ${ticketId}`);
    });

    // Send message
    socket.on("send_message", async (data) => {
      try {
        const { ticketId, message, attachments = [] } = data;

        if (!ticketId || !message) {
          socket.emit("error", { message: "Ticket ID and message are required" });
          return;
        }

        // Verify user has access
        await supportService.getTicketById(ticketId, userId, userType);

        // Create message
        const newMessage = await supportService.sendMessage(
          ticketId,
          userId,
          userType,
          message,
          attachments
        );

        // Get populated message
        const populatedMessage = await supportMessageRepository.findById(newMessage._id);

        // Emit to all users in the ticket room
        supportNamespace.to(`ticket:${ticketId}`).emit("new_message", {
          message: populatedMessage,
        });

        // Update ticket's last message time
        await supportTicketRepository.updateLastMessageAt(ticketId);

        console.log(`Message sent in ticket ${ticketId} by user ${userId}`);
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Mark messages as read
    socket.on("mark_read", async (ticketId) => {
      try {
        await supportMessageRepository.markTicketMessagesAsRead(ticketId, userId, userType);
        
        // Notify others in the room
        socket.to(`ticket:${ticketId}`).emit("messages_read", {
          ticketId,
          readBy: userId,
        });
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });

    // Typing indicator
    socket.on("typing_start", (data) => {
      const { ticketId } = data;
      socket.to(`ticket:${ticketId}`).emit("user_typing", {
        ticketId,
        userId,
        userName: socket.user.name || socket.user.email || "User",
      });
    });

    socket.on("typing_stop", (data) => {
      const { ticketId } = data;
      socket.to(`ticket:${ticketId}`).emit("user_stopped_typing", {
        ticketId,
        userId,
      });
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`User ${userId} disconnected from support socket`);
    });
  });

  return supportNamespace;
};

