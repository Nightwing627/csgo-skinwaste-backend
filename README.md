# Skinwaste Backend

so all the source code related to backend is found under the branch dev can be found in src directory. There you can find the following directories:

```txt
constants : Contains all the constants related to the errors
models : Contains all the mongoose models
modules: Contains all modules like jackpot coinflip roulette etc..
routes : A versioned directory that contains all the routes on the backend.
utils : Just util functions that can be used on the app
views : Only used for the popup steam login(edited)
```

## Setup

> Below is a short guide on how to get started with development.

- Install NodeJS, LTS
- Install MongoDB (Mongoose Driver)
- Import configs from `/config/configs.json`
- npm/yarn install
- Setup Environment Variables
- npm/yarn run dev

### .env

```env
NODE_ENV=localhost
FRONTEND_URL=http://localhost:8080/
AUTH_BACKEND_URL=http://localhost:8081/
BACKEND_URL=http://localhost:8081/
DB_HOST=mongodb+srv://<username>:<password>@staging.domrn.mongodb.net/myFirstDatabase?retryWrites=true&w=majority
RANDOM_ORG_API_KEY=
```

### Database

> User data, game history, etc, can be seen and managed in the collections

- User ranks can be set in the "users" collection (0 on default, 1 for verified, 2 for mod, 3 for admin)
- Shop items/skins can be manually added in the "items" collection.
