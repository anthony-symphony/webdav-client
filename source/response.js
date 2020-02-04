const minimatch = require("minimatch");

function handleResponseCode(response) {
    const status = parseInt(response.status, 10);
    let err;
    if (status >= 400) {
        if (status === 401) {
            err = new Error("401 Unauthorized")
        }
        else if (status === 405) {
            err = new Error("405 Method Not Allowed: File or directory may already exist.")
        }
        else if (status === 409){
            err = new Error("409 Confict: Another file may already exist with the same name.")
        }
        else {
            err = new Error("Invalid response: " + status + " " + response.statusText);
        }
        err.status = status;
        err.response = response
        throw err;
    }
    return response
}

function processGlobFilter(files, glob) {
    return files.filter(file => minimatch(file.filename, glob, { matchBase: true }));
}

function processResponsePayload(response, data, isDetailed = false) {
    return isDetailed
        ? {
              data,
              headers: response.headers || {}
          }
        : data;
}

module.exports = {
    handleResponseCode,
    processGlobFilter,
    processResponsePayload
};
