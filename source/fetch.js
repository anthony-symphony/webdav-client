const nodeFetch = require("node-fetch")
const axios = require("axios")
const { merge } = require("./merge.js");
const { getPatcher } = require("./patcher.js");
const { generateDigestAuthHeader } = require("./auth.js");

function makeNonce() {
    const cnonceSize = 32;
    const nonceRaw = "abcdef0123456789";

    let uid = "";
    for (let i = 0; i < cnonceSize; ++i) {
        uid += nonceRaw[Math.floor(Math.random() * nonceRaw.length)];
    }
    return uid;
}

function parseAuth(response, _digest) {
    const authHeader = response.headers["www-authenticate"] || "";

    if (authHeader.split(/\s/)[0].toLowerCase() !== "digest") {
        return false;
    }

    const re = /([a-z0-9_-]+)=(?:"([^"]+)"|([a-z0-9_-]+))/gi;
    for (;;) {
        var match = re.exec(authHeader);
        if (!match) {
            break;
        }
        _digest[match[1]] = match[2] || match[3];
    }

    _digest.nc++;
    _digest.cnonce = makeNonce();

    return true;
}

function request(requestOptions) {
    if (requestOptions.requestMethod && requestOptions.requestMethod === "fetch") {
        if (requestOptions.withCredentials !== undefined) {
            if (requestOptions.withCredentials) {
                requestOptions.credentials = "include"
            }
            else {
                requestOptions.credentials = "omit"
            }
            requestOptions.withCredentials = undefined
        }
        if (requestOptions.data) {
            requestOptions.body = requestOptions.data
            requestOptions.data = undefined
        }
        return getPatcher().patchInline("request", (url, options) => nodeFetch(url, options).then(response => {
            let newHeaderProp = {}
            for (let header of response.headers.entries()) {
                newHeaderProp[header[0]] = header[1]
            }
            let newResp = {
                headers: newHeaderProp,
                status: response.status,
                statusText: response.statusText
            }
            if (options.responseType === "stream") {
                newResp.data = response.body
                return newResp
            }
            else {
                try {
                    return response.text().then(respText => {
                        newResp.data = respText
                        return newResp
                    })
                }
                catch {
                    return response.arrayBuffer().then(arrayBuffer => {
                        newResp.data = new Buffer(arrayBuffer);
                        return newResp
                    })
                }
            }
        }), requestOptions.url, requestOptions)
    }
    else {
        return getPatcher().patchInline("request", options => axios(options), requestOptions);
    }
}

function fetch(requestOptions) {
    // Client not configured for digest authentication
    if (!requestOptions._digest) {
        return request(requestOptions);
    }

    // Remove client's digest authentication object from request options
    const _digest = requestOptions._digest;
    delete requestOptions._digest;

    // If client is already using digest authentication, include the digest authorization header
    if (_digest.hasDigestAuth) {
        requestOptions = merge(requestOptions, {
            headers: {
                Authorization: generateDigestAuthHeader(requestOptions, _digest)
            }
        });
    }

    // Perform the request and handle digest authentication
    return request(requestOptions).then(function(response) {
        if (response.status == 401) {
            _digest.hasDigestAuth = parseAuth(response, _digest);

            if (_digest.hasDigestAuth) {
                requestOptions = merge(requestOptions, {
                    headers: {
                        Authorization: generateDigestAuthHeader(requestOptions, _digest)
                    }
                });

                return request(requestOptions).then(function(response2) {
                    if (response2.status == 401) {
                        _digest.hasDigestAuth = false;
                    } else {
                        _digest.nc++;
                    }
                    return response2;
                });
            }
        } else {
            _digest.nc++;
        }
        return response;
    });
}

module.exports = fetch;
