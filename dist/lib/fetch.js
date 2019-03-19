"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timedFetch = (url, options, timeout = 5000) => new Promise((resolve, reject) => {
    let timer = setTimeout(() => reject('Fetch: request timeout out.'), timeout);
    fetch(url, options).then(response => resolve(response), error => reject(error)).finally(() => clearTimeout(timer));
});
