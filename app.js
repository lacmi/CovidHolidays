const bodyparser = require('body-parser');
const cookie_session = require('cookie-session');
const express = require('express');
const fs = require('fs');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3');
const ws = require('ws');


const port = 8080;
const host_address = 'localhost';
const public_dir = 'public';
const pages_dir = 'pages';
const uploads_dir = 'uploads';
const users = require('./users.json');
const jwt_secret = '^<R)Zj51j,7"hNyvL.tB';
const session_secret = 'g.3*7?*%ga8Ep-YN0/8X';


const app = express();
const upload = multer({dest: uploads_dir});
const db = new sqlite3.Database("db.sqlite3");

const wsServer = new ws.Server({noServer: true});
wsServer.on('connection', (socket) => {
    socket.on('message', (message) => {
        message = JSON.parse(message);
        const operation = message.op;
        switch (operation) {
            default:
                console.log('Unexpected WebSocket message:', message);
                break;
        }
    });
});

app.use(morgan('common'));
app.use(helmet());
app.use(cookie_session({
    cookie: {
        path: '/',
        httpOnly: true,
        secure: true,
        maxAge: 43200000,
        sameSite: true
    },
    secret: session_secret,
    name: "session_id"
}));
app.use(bodyparser.json());
app.use(bodyparser.urlencoded({extended: false}));
app.use(express.static(public_dir));

let authenticator = function (req, res, next) {
    const token = req.session.authToken;
    if (token) {
        try {
            const decoded = jwt.verify(token, jwt_secret);
            req.user = {
                username: decoded.username,
                role: decoded.role
            };
            return next();
        } catch(err) {
            console.log("Invalid jwt token:", token);
        }
    }
    console.log('Unauthorized access.', req.method, req.url);
    res.status(401).redirect('/login?unauthorized-access');
};

let post_post_validator = function (req, res, next) {
    let invalid = false;
    if (req.body === undefined || req.body.post_title === undefined || req.body.post_text === undefined) {
        invalid = true
    } else if (typeof req.body.post_title !== 'string' || typeof req.body.post_text !== 'string') {
        invalid = true;
    } else if (req.body.post_text === '' && req.file === undefined) {
        invalid = true;
    } else if (req.file !== undefined) {
        if (req.file.mimetype.startsWith('image/') === false) {
            invalid = true;
        }
    }
    if (invalid) {
        console.log('Invalid new post.');
        res.status(400).end();
    } else {
        next();
    }
};

let get_post_validator = function (req, res, next) {
    let invalid = false;
    if (isNaN(req.params.post_id) && isNaN(parseFloat(req.params.post_id))) {
        invalid = true;
    }
    if (invalid) {
        console.log('Invalid post request.');
        res.status(400).end();
    } else {
        next();
    }
};

let get_date_text = function (epoch_number) {
    const date = new Date(epoch_number);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}, ${date.getHours()}:${date.getMinutes()}`;
};


app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, pages_dir, 'login.html'));
});
app.post('/login', (req,res) => {
    const {username, password} = req.body;
    const user = users.find(u => { return u.username === username && u.password === password });
    if (user) {
        req.session.authToken = jwt.sign(
            {username: user.username, role: user.role},
            jwt_secret,
            {expiresIn: "12h"}
        );
        console.log("Successful login.", user.username);
        res.redirect('/');
    } else {
        res.status(401).redirect('/login?invalid-login');
    }
});
app.get('/', authenticator, (req, res) => {
    res.sendFile(path.join(__dirname, pages_dir, 'index.html'));
});
app.get('/posts', authenticator, (req, res) => {
    db.all(`select post_id, post_time, post_author, post_title, post_text, post_image_mimetype from posts order by post_time desc`, (error, rows) => {
        if (error) {
            console.log('Error retrieving posts:', error);
            res.status(500).end();
        } else {
            let posts = [];
            rows.forEach((row) => {
                posts.push({
                    id: row.post_id,
                    time: get_date_text(row.post_time),
                    author: row.post_author,
                    title: row.post_title,
                    text: row.post_text,
                    image: (row.post_image_mimetype !== null)
                });
            });
            res.send(posts);
        }
    });
});
app.get('/post/:post_id', authenticator, get_post_validator, (req, res) => {
    db.get(`select post_id, post_time, post_author, post_title, post_text, post_image_mimetype from posts where post_id = ${req.params.post_id}`, (error, row) => {
        if (error) {
            console.log('Error retrieving post:', error);
            res.status(500).end();
        } else if (row) {
            res.send({
                id: row.post_id,
                time: get_date_text(row.post_time),
                author: row.post_author,
                title: row.post_title,
                text: row.post_text,
                image: (row.post_image_mimetype !== null)
            });
        } else {
            res.status(404).end();
        }
    });
});
app.get('/post/:post_id/image', authenticator, get_post_validator, (req, res) => {
    db.get(`select post_image_data, post_image_mimetype from posts where post_id = ${req.params.post_id}`, (error, row) => {
        if (error) {
            console.log('Error retrieving post:', error);
            res.status(500).end();
        } else if (row) {
            res.set({'Content-Type': row.post_image_mimetype});
            res.send(row.post_image_data);
        } else {
            res.status(404).end();
        }
    });
});
app.post('/post', authenticator, upload.single('post_image'), post_post_validator, (req, res) => {
    columns = [];
    column_placeholders = [];
    column_values = {
        $post_author: req.user.username
    };
    if (req.body.post_title !== '') {
        columns.push('post_title');
        column_placeholders.push('$post_title');
        column_values.$post_title = req.body.post_title;
    }
    if (req.body.post_text !== '') {
        columns.push('post_text');
        column_placeholders.push('$post_text');
        column_values.$post_text = req.body.post_text;
    }
    if (req.file !== undefined) {
        columns.push('post_image_data');
        columns.push('post_image_mimetype');
        column_placeholders.push('$post_image_data');
        column_placeholders.push('$post_image_mimetype');
        let image = fs.readFileSync(req.file.path);
        fs.unlinkSync(req.file.path);
        column_values.$post_image_data = image;
        column_values.$post_image_mimetype = req.file.mimetype;
    }
    db.run(
        `insert into posts(post_time, post_author, ${columns.join(', ')}) values(${Date.now()}, $post_author, ${column_placeholders.join(', ')})`,
        column_values,
        function(error) {
            if (error !== null) {
                console.log('Could not insert new post in db:', error);
                return res.status(500).end();
            }
            wsServer.clients.forEach((client) => {
                if (client.readyState === ws.OPEN) {
                    client.send(JSON.stringify({
                        op: 'NEW_POST',
                        post_id: this.lastID
                    }));
                }
            });
        }
    );
    res.status(201).end();
});


const server = app.listen(port, host_address, () => {
    console.log(`Server listening at http://${host_address}:${port}`);
});
server.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, socket => {
        wsServer.emit('connection', socket, req);
    });
});
