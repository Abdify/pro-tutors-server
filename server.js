const express = require("express");
const cors = require("cors");
const MongoClient = require("mongodb").MongoClient;
const jwt = require("jsonwebtoken");
const { ObjectId } = require("bson");
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());

const verifyJwt = (req, res, next) => {
    const token = req.headers["x-access-token"];

    if (token) {
        jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
            if (!err) {
                //success
                req.uid = decoded.id;
                next();
            } else {
                res.send({ message: "token doesn't match!" });
            }
        });
    } else {
        res.send({ message: "No token found!" });
    }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ykse1.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

client.connect((err) => {
    console.log("Errors found: ", err);
    const coursesCollection = client.db(process.env.DB_NAME).collection("courses");
    const usersCollection = client.db(process.env.DB_NAME).collection("users");
    const enrollsCollection = client.db(process.env.DB_NAME).collection("enrolls");
    const reviewsCollection = client.db(process.env.DB_NAME).collection("reviews");

    app.post("/users", (req, res) => {
        const newUser = req.body;
        const uid = newUser.uid;
        usersCollection.findOne({uid: uid}).then((user) => {
            if(user){
                const token = jwt.sign({ id: uid }, process.env.TOKEN_SECRET, {
                    expiresIn: 10000,
                });
                res.send({
                    success: true,
                    token: token,
                });
            } else {
                newUser.enrolledCourses = [];
                newUser.isAdmin = false;
                usersCollection.insertOne(newUser).then((result) => {
                    const token = jwt.sign({ id: uid }, process.env.TOKEN_SECRET, {
                        expiresIn: 2000,
                    });
                    res.send({
                        success: true,
                        token: token,
                    });
                });
            }
        })
    });

    app.get("/getUser", verifyJwt, (req, res) => {
        usersCollection.findOne({ uid: req.uid }).then((user) => {
            if (user) {
                // const { uid, displayName, email } = user;
                res.send({ auth: true, user });
            } else {
                res.send({ auth: false });
            }
        });
    });

    app.post("/makeAdmin", verifyJwt, (req, res) => {
        const email = req.body.email;
        usersCollection
            .findOneAndUpdate(
                { email: email },
                {
                    $set: {
                        isAdmin: true,
                        addedBy: req.body.addedBy,
                    }
                }
            )
            .then((result) => {
                console.log(result);
                if (result.lastErrorObject.updatedExisting) {
                    res.send({
                        success: true,
                        message: "Success",
                    });
                } else {
                    res.send({
                        success: false,
                        message: "Something went wrong! please try again!",
                    });
                }
            })
            .catch((err) => console.log(err));
    });

    app.post("/addCourse", verifyJwt, (req, res) => {
        const newCourse = req.body;
        console.log(newCourse);
        coursesCollection.insertOne(newCourse).then((result) => {
            res.send(result.insertedCount > 0);
        });
    });

    app.get("/courses", (req, res) => {
        coursesCollection.find({}).toArray((err, courses) => {
            res.send(courses);
        });
    });

    app.get('/course/:courseId', (req, res) => {
        const courseId = req.params.courseId;
        coursesCollection.findOne({ _id: ObjectId(courseId) }).then((course) => {
            res.send(course);
        });
    });

    app.post("/enrollCourse", verifyJwt, (req, res) => {
        const enrollInfo = req.body;
        enrollInfo.course.status = "Ongoing";
        usersCollection.findOneAndUpdate({uid: req.uid}, {
            $push: {
                enrolledCourses: enrollInfo.course._id,
            }
        });
        enrollsCollection.insertOne(enrollInfo)
        .then(result => {
            res.send(result.insertedCount > 0)
        })
    });

    app.post('/addReview', (req, res) => {
        const newReview = req.body;
        // console.log(newReview);
        reviewsCollection.insertOne(newReview)
        .then(result => {
            res.send(result.insertedCount > 0);
        })
    });

    app.get('/reviews', (req, res) => {
        reviewsCollection.find({}).limit(6).toArray((err, reviews) => {
            res.send(reviews);
        })
    });

    app.get("/enrolledCourses", verifyJwt, (req, res) => {
        usersCollection.findOne({uid: req.uid})
        .then(user => {
            let filter = {};
            if(!user.isAdmin){
                filter["currentUser.uid"] = req.uid;
            }
            enrollsCollection.find(filter).toArray((err, courses) => {
                console.log(courses, user.isAdmin);
                res.send(courses);
            })
        })
    });

    app.delete("/courses/:id", (req, res) => {
        const id = req.params.id;
        coursesCollection
            .findOneAndDelete({ _id: ObjectId(id) })
            .then((deletedCourse) => {
                if (deletedCourse) {
                    res.send({
                        deleted: true,
                        message: `Successfully deleted course: ${deletedCourse}.`,
                    });
                } else {
                    res.send({ deleted: false, message: "No course matches the provided id." });
                }
            })
            .catch((err) =>
                res.send({
                    deleted: false,
                    message: `Failed to find and delete course: ${err}`,
                })
            );
    });

    app.put("/changeEnrollStatus", verifyJwt, (req, res) => {
        enrollsCollection
            .findOneAndUpdate(
                { _id: ObjectId(req.body.enrollId) },
                {
                    $set: { "course.status": req.body.status },
                }
            )
            .then((result) => {
                console.log(result);
                res.send(result.lastErrorObject.updatedExisting);
            });
    });
});

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Listening at port ${port}`);
});
