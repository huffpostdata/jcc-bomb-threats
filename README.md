# Developing

1. Install NodeJS >= 7.0 from https://nodejs.org/en/
2. `npm install`
3. `generator/dev.js`

Then browse to http://localhost:3000

## Auto-refresh page during dev

It's so handy if you have your browser window open beside the code....

Install the [Chrome extension](https://chrome.google.com/webstore/detail/livereload/jnihajbhpnppcggbcgedagnkighmdlei)

Now browse to http://localhost:3000 and enable LiveReload in your browser.

# Directory layout and docs for dependencies

This framework goes from zero to website in milliseconds. On load, it does this:

1. Loads and computes, as specified in `app/Database.js`
2. Generates assets (CSS, Javascript, images, etc)
3. Generates pages
4. Serves it all

All of this happens in memory. `generator/dev.js` updates the website it serves
each time any code changes. `generator/upload.js` uploads everything to S3.

When developing, look to:

* `config/pages.yml`: it's kinda a router, except it explicitly lists all
  possible endpoints. Here's where we comment on what each endpoint does.
* `./views`: [MarkoJS](http://markojs.com/docs/) files. MarkoJS documentation is
  patchy, but it's oh-so-fast. Each template has a `data` variable:
  * `data.helpers.X` methods are in `app/Helper.js`
  * `data.model` is set in `app/Database.js`
  * `data.X` is usually defined in `generator/PageContext.js`
* `./app`: the views invoke code from `app/Helpers.js`. The generator invokes
  code from `app/Database.js`. All the other files are dependencies of one or
  the other. Write ES6 code: no semicolons, `'use strict'` throughout, *no*
  `var` anywhere.
* `./assets/images` et al: As specified in `config/assets.yml`, these get a
  digest appended to them. Refer to them like this:
  `data.path_to_asset('images/X.jpg')`
* `./assets/javascripts/[entrypoint].js`: as specified in `config/assets.yml`,
  these are entrypoints. (Some other Javascript files are digested, just like
  images.) They may `require()` files in subdirectories. Browsers see this
  Javascript, bundled but not modified -- write browser-compatible code.
* `./assets/javascripts/[subdir]/[blah].js`: entrypoints may `require()`
  these -- write browser-compatible code. `app/` code may `require()` this,
  too, for any structures/methods that we share between client and server.
* `./assets/stylesheets/[entrypoint].scss`: as specified in
  `config/assets.yml`, these are SCSS entrypoints. Colors go in
  `_variables.scss`. Code mobile-first; use
  `@media (min-width: $min-desktop-width)`, _never_ `@media (max-width: ...)`.

## Updating our Google Sheets

If you're adding/removing sheets, look to `config/google-sheets.yml`.

Then run `npm run update-google-sheets` to download newer data from Google
Sheets.

You'll have to commit the newly-downloaded TSV to this repository to publish it.

# Deploying

Here's how we set up our "staging" server:

1. Create a server
2. On the server, `sudo mkdir /opt/$SLUG && sudo chown $USER:$USER /opt/$SLUG && cd /opt/$SLUG && git init && git config receive.denyCurrentBranch updateInstead` ([updateInstead documentation](https://github.com/blog/1957-git-2-3-has-been-released))
3. On the server, write to `/opt/$SLUG/.git/hooks/post-receive` (substituting $SLUG):
    ```
    #!/bin/sh

    pushd /opt/$SLUG >/dev/null

    npm install --production

    BASE_URL=... \
    S3_BUCKET=... \
    UGLIFY=true \
    generator/upload.js
    ```
4. On the server, `chmod +x /opt/$SLUG/.git/hooks/post-receive`
5. On each dev machine, `git remote add staging $USER@$SERVER:/opt/$SLUG`
6. (Once per deploy, on a dev machine) `git push staging master`. You'll see the output in your console.
