const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const {models} = require("../models");
const cloudinary = require('cloudinary');
const fs = require('fs');
const attHelper = require("../helpers/attachments");

const paginate = require('../helpers/paginate').paginate;

// Optios for the files uploaded to Cloudinary
const cloudinary_upload_options = {
    async: true,
    folder: "/core/quiz2018/attachments",
    resource_type: "auto",
    tags: ['core', 'quiz']
};

// Autoload the quiz with id equals to :quizId
exports.load = (req, res, next, quizId) => {

    models.quiz.findById(quizId, {
        include: [
            {model: models.tip,include:[{model: models.user, as: 'author'}]},
            {model: models.user, as: 'author'}
        ]
    })
    .then(quiz => {
        if (quiz) {
            req.quiz = quiz;
            next();
        } else {
            throw new Error('There is no quiz with id=' + quizId);
        }
    })
    .catch(error => next(error));
};



// MW that allows actions only if the user logged in is admin or is the author of the quiz.
exports.adminOrAuthorRequired = (req, res, next) => {

    const isAdmin  = !!req.session.user.isAdmin;
    const isAuthor = req.quiz.authorId === req.session.user.id;

    if (isAdmin || isAuthor) {
        next();
    } else {
        console.log('Prohibited operation: The logged in user is not the author of the quiz, nor an administrator.');
        res.send(403);
    }
};


// GET /quizzes
exports.index = (req, res, next) => {
let countOptions = {
where: {}
};
let title = "Questions";
// Search:
const search = req.query.search || '';
if (search) {
const search_like = "%" + search.replace(/ +/g,"%") + "%";
countOptions.where.question = { [Op.like]: search_like };
}
// If there exists "req.user", then only the quizzes of that user are shown
if (req.user) {
countOptions.where.authorId = req.user.id;
title = "Questions of " + req.user.username;
}
models.quiz.count(countOptions)
.then(count => {
// Pagination:
const items_per_page = 10;
// The page to show is given in the query
const pageno = parseInt(req.query.pageno) || 1;
// Create a String with the HTMl used to render the pagination buttons.
// This String is added to a local variable of res, which is used into the application layout file.
res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);
const findOptions = {
...countOptions,
offset: items_per_page * (pageno - 1),
limit: items_per_page,
include: [{model: models.user, as: 'author'}]
};
return models.quiz.findAll(findOptions);
})
.then(quizzes => {
res.render('quizzes/index.ejs', {
quizzes,
search,
title
});
})
.catch(error => next(error));
};exports.index = (req, res, next) => {

    let countOptions = {
        where: {},
       
    };

    // const searchfavourites = req.query.searchfavourites || "";

    let title = "Questions";

    // Search:
    const search = req.query.search || '';
    if (search) {
        const search_like = "%" + search.replace(/ +/g,"%") + "%";

        countOptions.where.question = { [Op.like]: search_like };
    }

    // If there exists "req.user", then only the quizzes of that user are shown
    if (req.user) {
        countOptions.where.authorId = req.user.id;

        if (req.session.user && req.session.user.id == req.user.id) {
            title = "My Questions";
        } else {
            title = "Questions of " + req.user.username;
        }
    }

    // Filter: my favourite quizzes:
    if (req.session.user) {
        if (searchfavourites) {
            countOptions.include.push({
                model: models.user,
                as: "fans",
                where: {id: req.session.user.id},
                attributes: ['id']

            });
        } else {

            // NOTE:
            // It should be added the options ( or similars )
            // to have a lighter query:
            //    where: {id: req.session.user.id},
            //    required: false  // OUTER JOIN
            // but this does not work with SQLite. The generated
            // query fails when there are several fans of the same quiz.

            countOptions.include.push({
                model: models.user,
                as: "fans",
                attributes: ['id']
            });
        }
    }

    models.quiz.count(countOptions)
    .then(count => {

        // Pagination:

        const items_per_page = 10;

        // The page to show is given in the query
        const pageno = parseInt(req.query.pageno) || 1;

        // Create a String with the HTMl used to render the pagination buttons.
        // This String is added to a local variable of res, which is used into the application layout file.
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        const findOptions = {
            ...countOptions,
            offset: items_per_page * (pageno - 1),
            limit: items_per_page
        };

        findOptions.include.push(models.attachment);
        findOptions.include.push({
            model: models.user,
            as: 'author'
        });

        return models.quiz.findAll(findOptions);
    })
    .then(quizzes => {

        const format = (req.params.format || 'html').toLowerCase();

        switch (format) {
            case 'html':

                // Mark favourite quizzes:
                if (req.session.user) {
                    quizzes.forEach(quiz => {
                        quiz.favourite = quiz.fans.some(fan => {
                            return fan.id == req.session.user.id;
                        });
                    });
                }

                res.render('quizzes/index.ejs', {
                    quizzes,
                    search,
                    searchfavourites,
                    cloudinary,
                    title
                });
                break;

            case 'json':
                res.json(quizzes);
                break;

            default:
                console.log('No supported format \".'+format+'\".');
                res.sendStatus(406);
        }
    })
    .catch(error => next(error));
};


// GET /quizzes/:quizId
exports.show = (req, res, next) => {
const {quiz} = req;
res.render('quizzes/show', {quiz});


// GET /quizzes/new
exports.new = (req, res, next) => {

    const quiz = {
        question: "",
        answer: ""
    };

    res.render('quizzes/new', {quiz});
};

// POST /quizzes/create
exports.create = (req, res, next) => {
const {question, answer} = req.body;
const authorId = req.session.user && req.session.user.id || 0;
const quiz = models.quiz.build({
question,
answer,
authorId
});
// Saves only the fields question and answer into the DDBB
quiz.save({fields: ["question", "answer", "authorId"]})
.then(quiz => {
req.flash('success', 'Quiz created successfully.');
res.redirect('/quizzes/' + quiz.id);
})
.catch(Sequelize.ValidationError, error => {
req.flash('error', 'There are errors in the form:');
error.errors.forEach(({message}) => req.flash('error', message));
res.render('quizzes/new', {quiz});
})
.catch(error => {
req.flash('error', 'Error creating a new Quiz: ' + error.message);
next(error);
});
};

// GET /quizzes/:quizId/edit
exports.edit = (req, res, next) => {

    const {quiz} = req;

    res.render('quizzes/edit', {quiz});
};


// PUT /quizzes/:quizId
exports.update = (req, res, next) => {
const {quiz, body} = req;
quiz.question = body.question;
quiz.answer = body.answer;
quiz.save({fields: ["question", "answer"]})
.then(quiz => {
req.flash('success', 'Quiz edited successfully.');
res.redirect('/quizzes/' + quiz.id);
})
.catch(Sequelize.ValidationError, error => {
req.flash('error', 'There are errors in the form:');
error.errors.forEach(({message}) => req.flash('error', message));
res.render('quizzes/edit', {quiz});
})
.catch(error => {
req.flash('error', 'Error editing the Quiz: ' + error.message);
next(error);
});
};

// DELETE /quizzes/:quizId
exports.destroy = (req, res, next) => {

    // Delete the attachment at Cloudinary (result is ignored)
  exports.destroy = (req, res, next) => {
req.quiz.destroy()
.then(() => {
req.flash('success', 'Quiz deleted successfully.');
res.redirect('/goback');
})
.catch(error => {
req.flash('error', 'Error deleting the Quiz: ' + error.message);
next(error);
});
};


// GET /quizzes/:quizId/play
exports.play = (req, res, next) => {
const {quiz, query} = req;
const answer = query.answer || '';
res.render('quizzes/play', {
quiz,
answer
});
};

exports.check = (req, res, next) => {
const {quiz, query} = req;
const answer = query.answer || "";
const result = answer.toLowerCase().trim() === quiz.answer.toLowerCase().trim();
res.render('quizzes/result', {
quiz,
result,
answer
});
};


// GET /quizzes/randomplay
exports.randomplay = (req, res, next) => {
//cojo la respuesta del query
var answer = req.query.answer || "";
//inicializo la variable a 0 si empezamos desde el principio o al valor guardado en la sesión si simplemente
//estamos continuando con otra pregunta
req.session.score = req.session.score || 0;
//promesa con la que cojo todos los quizzes de models(BBDD) y los meto en req.session.preguntas creada de cero por eso tiene el ||
//por si no está creada que lo rellene con quizzes y si está creada que cargue las preguntas que faltan
models.quiz.findAll()
.then(function(quizzes) {
req.session.preguntas = req.session.preguntas || quizzes;
//escogemos un número aleatorio para hacer preguntas de forma random
var posicion;
posicion = Math.floor(Math.random()*req.session.preguntas.length);
//comprobamos que la posicion que hemos escogido para hacer la pregunta no sea .lenght porque ese valor no existe en nuestro array
if (posicion === req.session.preguntas.length) {
posicion--;
}
//cogemos la pregunta aleatoria con la variable posicion del array preguntas
var quiz = req.session.preguntas[posicion];
//esto era solo para debuggear
console.log(req.session.preguntas.length);
//borramos la pregunta( con splice se borra entero del array no pone un cero en el hueco)
req.session.preguntas.splice(posicion,1);
//Devolvemos la pregunta, respuesta y puntuacion
res.render('quizzes/randomplay', {
quiz: quiz,
answer: answer,
score: req.session.score
});
})
//por si errores
.catch(function (error) {
next(error);
});
};


exports.randomcheck = function (req, res, next) {
//cojo la variable query que es la respuesta
var answer = req.query.answer || "";
//compruebo si la respuesta está bien y en var se mete o true o false
var result = answer.toLowerCase().trim() === req.quiz.answer.toLowerCase().trim();
//cargo el array de preguntas
var preguntas= req.session.preguntas;
//miro si el resultado es true y aumento la puntuacion
if (result) {
req.session.score++;
var score = req.session.score;
}
//si el resultado no era true se mete aqui, guarda la puntuación en la variable score y la guardada en sesión la inicializa a cero
//cargo las preguntas de nuevo
else{
var score = req.session.score;
var preguntas = req.session.preguntas;
req.session.score = 0;
}
// si el array tiene longitud cero significa que hemos contestado a todas las preguntas por eso le mete un valor undefined
//a req.session.preguntas para que al iniciarlo de nuevo en randomcheck las cargue y no lo ponga como un array vacío
if (preguntas.length===0){
req.session.preguntas = undefined;
req.session.score = 0;
//Sacamos por pantalla la vista
res.render('quizzes/random_nomore', {
score: score
});
}
else {
//Sacamos por pantalla la vista, quiz, answer, score y result
res.render('quizzes/random_result', {
quiz: req.quiz,
result: result,
answer: answer,
score: score
});
}
};