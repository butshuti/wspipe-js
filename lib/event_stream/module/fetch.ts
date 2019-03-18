export const timedFetch = (url: string, options: Object, timeout=5000) : Promise<Response> =>
    new Promise((resolve, reject) =>{
        let timer = setTimeout(() => reject('Fetch: request timeout out.'), timeout);
        fetch(url, options).then(
            response => resolve(response),
            error => reject(error)
        ).finally(() => clearTimeout(timer));
    });
