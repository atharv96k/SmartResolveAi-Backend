import express from "express";

import { login, logout, signUp, updateUser, getUsers, deleteUser } from "../controllers/user.js"; 
import { authenticate } from "../middlewares/auth.js";

const router = express.Router();


router.post("/signup", signUp);
router.post("/login", login);
router.post("/logout", logout);
router.post("/update-user", authenticate, updateUser);
router.get("/users", authenticate, getUsers);


router.delete("/users/:id", authenticate, deleteUser);

export default router;