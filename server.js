const express = require('express');
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const multer = require("multer");
const app = express();
const cors = require('cors');
const { Schema } = mongoose;

const port = 5000;
const url = "mongodb+srv://myEcommerce:qqnnwhXV3@cluster0.er90s14.mongodb.net/ecom";

app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

mongoose.connect(url).then(() => {
    console.log(`Database connected successfully with host ${mongoose.connection.host}`);
}).catch((err) => {
    console.log(`Error in DB connection: ${err}`);
});

app.use(cors({
  origin:  'http://localhost:3000',
  methods: ['GET', 'POST', 'DELETE', 'PATCH']
}));

const productSchema = new Schema({
    title: { type: String, required: true },
    description: String,
    category: String,
    price: { type: Number, required: true },
    image: {
        data: Buffer,
        contentType: String
    }
});

const Product = mongoose.model("product", productSchema);

app.get("/", async (req, res) => {
    try {
        const products = await Product.find({}, '-image.data');
        res.status(200).json({ products });
    } catch (error) {
        res.status(500).json({ msg: "Error occurred while fetching products", error });
    }
});

app.get('/product-image/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product?.image?.data) {
            res.set('Content-Type', product.image.contentType);
            res.send(product.image.data);
        } else {
            res.status(404).send("Image not found");
        }
    } catch (err) {
        res.status(500).send("Error fetching image");
    }
});

app.post("/create", upload.single("image"), async (req, res) => {
    try {
        const { title, description, category, price } = req.body;
        const imageFile = req.file;

        const newProduct = new Product({
            title,
            description,
            category,
            price,
            image: imageFile ? {
                data: imageFile.buffer,
                contentType: imageFile.mimetype
            } : undefined
        });

        await newProduct.save();
        res.status(201).json({ msg: "Product created successfully", product: newProduct });
    } catch (error) {
        console.error("Error creating product:", error);
        res.status(500).json({ msg: "Internal server error" });
    }
});

app.patch("/updateProduct/:id", upload.single("image"), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, category, price } = req.body;
        const imageFile = req.file;

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ msg: `Product with id ${id} not found` });
        }

        product.title = title || product.title;
        product.description = description || product.description;
        product.category = category || product.category;
        product.price = price || product.price;

        if (imageFile) {
            product.image = {
                data: imageFile.buffer,
                contentType: imageFile.mimetype
            };
        }

        await product.save();
        res.status(200).json({ msg: "Product updated successfully", product });
    } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).json({ msg: "Internal server error" });
    }
});

app.delete("/deleteProduct/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const product = await Product.findByIdAndDelete(id);

        if (!product) {
            return res.status(404).json({ msg: `Product with id ${id} not found` });
        }

        res.status(200).json({ msg: "Product deleted successfully" });
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({ msg: "Internal server error" });
    }
});

const userSchema = new Schema({
    name: String,
    email: String,
    phoneNo: String,
    address: String
});

const userModel = mongoose.model("user", userSchema);

app.post("/createUser", async (req, res) => {
    try {
        const { name, email, phoneNo, address } = req.body;

        if (!name || !email) {
            return res.status(400).json({ msg: "Name and Email are required" });
        }

        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ msg: "User already exists" });
        }

        const newUser = new userModel({ name, email, phoneNo, address });
        await newUser.save();

        res.status(201).json(newUser);
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({ msg: "Server error" });
    }
});

app.get("/user", async (req, res) => {
    try {
        const users = await userModel.find({});
        res.status(200).json({ users });
    } catch (error) {
        res.status(500).json({ msg: "Error occurred while fetching users", error });
    }
});

app.delete("/deleteUser/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const user = await userModel.findByIdAndDelete(id);

        if (!user) {
            return res.status(404).json({ msg: `User with id ${id} not found` });
        }

        res.status(200).json({ msg: `User deleted successfully` });
    } catch (error) {
        res.status(500).json({ msg: `Internal server error: ${error}` });
    }
});

const itemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "product", required: true },
  title: String,
  quantity: { type: Number, default: 1 },
  price: Number
}, { _id: false });

const orderSchema = new Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  items: [itemSchema],
  status: { type: String, enum: ['pending', 'preparing', 'handover', 'delivered'], default: 'pending' },
  orderDate: { type: Date, default: Date.now },
  totalAmount: Number
});

const orderModel = mongoose.model("order", orderSchema);

app.post("/createOrder", async (req, res) => {
    const { userId, items } = req.body;

    if (!userId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ msg: "User ID and order items are required" });
    }

    try {
        const user = await userModel.findById(userId);
        if (!user) return res.status(400).json({ msg: "User not found" });

        let totalAmount = 0;

        const detailedItems = await Promise.all(
            items.map(async (item) => {
                const product = await Product.findById(item.productId);
                if (!product) throw new Error(`Product with id ${item.productId} not found`);

                totalAmount += product.price * item.quantity;

                return {
                    productId: product._id,
                    title: product.title,
                    quantity: item.quantity,
                    price: product.price,
                };
            })
        );

        const newOrder = await orderModel.create({
            user: user._id,
            items: detailedItems,
            totalAmount,
            status: 'pending',
        });

        res.status(201).json({ msg: "Order placed successfully", order: newOrder });
    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ msg: "Internal server error", error: error.message });
    }
});

app.get("/orders/:userId", async (req, res) => {
    try {
        const orders = await orderModel.find({ user: req.params.userId })
            .populate("user", "name email phoneNo")
            .populate("items.productId", "title price");

        if (!orders.length) {
            return res.status(404).json({ msg: "No orders found for this user" });
        }

        res.status(200).json({ orders });
    } catch (error) {
        console.error("Error fetching user orders:", error);
        res.status(500).json({ msg: "Error fetching orders", error: error.message });
    }
});

app.get("/orders", async (req, res) => {
    try {
        const orders = await orderModel.find()
            .populate("user", "name email phoneNo")
            .populate("items.productId", "title price");

        res.status(200).json({ orders });
    } catch (error) {
        console.error("Error fetching all orders:", error);
        res.status(500).json({ msg: "Failed to fetch orders", error: error.message });
    }
});

app.patch("/updateOrderStatus/:orderId", async (req, res) => {
    const { status } = req.body;

    if (!['pending', 'preparing', 'handover', 'delivered'].includes(status)) {
        return res.status(400).json({ msg: "Invalid status value" });
    }

    try {
        const updatedOrder = await orderModel.findByIdAndUpdate(
            req.params.orderId,
            { status },
            { new: true }
        );

        if (!updatedOrder) return res.status(404).json({ msg: "Order not found" });

        res.status(200).json({ msg: "Order status updated", updatedOrder });
    } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ msg: "Internal server error", error: error.message });
    }
});

app.delete("/deleteOrder/:orderId", async (req, res) => {
    const { orderId } = req.params;

    try {
        const deletedOrder = await orderModel.findByIdAndDelete(orderId);

        if (!deletedOrder) {
            return res.status(404).json({ success: false, msg: "Order not found" });
        }

        res.status(200).json({ success: true, msg: "Order deleted successfully" });
    } catch (error) {
        console.error("Error deleting order:", error);
        res.status(500).json({ success: false, msg: "Failed to delete order", error: error.message });
    }
});


const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const Admin = mongoose.model('admin', adminSchema);

app.post('/admin', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ msg: 'Username and password are required' });
  }

  try {
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ msg: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ username, password: hashedPassword });
    await newAdmin.save();

    res.status(201).json({ success: true, msg: 'Admin created', admin: newAdmin });
  } catch (error) {
    console.error('Error creating admin:', error);
    res.status(500).json({ msg: 'Error creating admin', error: error.message });
  }
});

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ msg: "Username and password are required" });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ msg: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ msg: "Invalid username or password" });
    }

    res.status(200).json({ success: true, msg: "Login successful", adminId: admin._id });
  } catch (error) {
    console.error("Error logging in admin:", error);
    res.status(500).json({ msg: "Internal server error" });
  }
});

app.get('/admin', async (req, res) => {
    try {
        const admins = await Admin.find({}, '-password');
        res.status(200).json({ admins });
    } catch (error) {
        res.status(500).json({ msg: "Internal server error" });
    }
});

app.patch('/admin/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password } = req.body;

        const updateData = {};
        if (username) updateData.username = username;
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedAdmin = await Admin.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }).select('-password');
        if (!updatedAdmin) {
            return res.status(404).json({ msg: "Admin not found" });
        }

        res.status(200).json({ msg: "Admin updated successfully", updatedAdmin });
    } catch (error) {
        res.status(500).json({ msg: "Internal server error" });
    }
});

app.delete('/admin/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedAdmin = await Admin.findByIdAndDelete(id);
        if (!deletedAdmin) {
            return res.status(404).json({ msg: "Admin not found" });
        }
        res.status(200).json({ msg: "Admin deleted successfully" });
    } catch (error) {
        res.status(500).json({ msg: "Internal server error" });
    }
});

app.listen(port, () => {
    console.log(`App is up and running on port ${port}`);
});
