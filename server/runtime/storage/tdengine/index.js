'use strict'

let {options, connect} = require("@tdengine/rest");
let utils = require('../../utils');

function TDengine(_settings, _log, _currentStorage) {
    let settings = _settings ;               // Application settings
    const logger = _log;                      // Application logger
    const currentStorage = _currentStorage;  // Database to set the last value (current)
    const database = settings.daqstore.database || 'fuxa' ;
    let conn;

    this.setCall = function (_fncGetProp) {
        fncGetTagProp = _fncGetProp;
        return this.addDaqValues;
    }
    var fncGetTagProp = null;

    this.init = async function () {
        let connOpt = Object.assign({}, options, settings.daqstore)
        connOpt.user = settings.daqstore.credentials.username ;
        connOpt.passwd = settings.daqstore.credentials.password;
        conn = connect(connOpt);
        //create database
        const cursor = conn.cursor();
        try {
            //TODO add retention
            let res = await cursor.query(`CREATE DATABASE IF NOT EXISTS ${database} `);
            res = await cursor.query(`CREATE STABLE IF NOT EXISTS ${database}.meters (dt TIMESTAMP,tag_id INT, tag_value BINARY(20)) TAGS (device_id INT,device_name BINARY(256) )`);

        } catch (error) {
            console.error(error);
        }

    }

    this.addDaqValues = function (tagsValues, deviceName, deviceId) {
        var dataToRestore = [];
        const cursor = conn.cursor();
        for (const tagid in tagsValues) {
            let tag = tagsValues[tagid];
            if (!tag.daq || utils.isNullOrUndefined(tag.value) || Number.isNaN(tag.value)) {
                if (tag.daq.restored) {
                    dataToRestore.push({id: tag.id, deviceId: deviceId, value: tag.value});
                }
                if (!tag.daq.enabled) {
                    continue;
                }
            }
            //async
            cursor.query(`INSERT INTO ${database}.t_${deviceId} USING ${database}.meters TAGS(${deviceId},'${deviceName}') VALUES (NOW,${tagid},'${tag.value}')`);
        }

        if (dataToRestore.length && currentStorage) {
            currentStorage.setValues(dataToRestore);
        }
    }

    this.getDaqValue = function (tagid, fromts, tots) {
        return new Promise(function (resolve, reject) {
            const cursor = conn.cursor()
            cursor.query(`SELECT * FROM ${database}.meters WHERE dt >= ${fromts} and dt < ${tots} `).then((result) =>{
                logger.debug(result)
                resolve(result.getResult().rows)
            }).catch((error) => {
                logger.error(`TDengine-getDaqValue failed! ${error}`)
                reject(error)
            })
        })
    }

    this.close = function(){
        //do noting
    }


    this.init().then(() => logger.info("TDengine connected"))
}

module.exports = {
    create: function (data, logger, currentStorage) {
        return new TDengine(data, logger, currentStorage);
    }
};