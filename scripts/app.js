/**
 * @license
 *
 * Copyright (c) 2015, University of Washington Interactive Data Lab.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * * Neither the name of the University of Washington Interactive Data Lab
 *   nor the names of its contributors may be used to endorse or promote products
 *   derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';
/* globals window */

angular.module('pcagnosticsviz', [
    'vlui',
    'ngSanitize',
    'ngTouch',
    'ngDragDrop',
    'zeroclipboard',
    'Chronicle',
    'LocalStorageModule',
    '720kb.tooltips',
    'ngOrderObjectBy',
    'angular-google-analytics',
    'ngWebworker','angular-loading-bar'])
  .constant('_', window._)
  .constant('vg', window.vg)
  .constant('cql', window.cql)
  .constant('ZSchema', window.ZSchema)
  .constant('Tether', window.Tether)
  .constant('Drop', window.Drop)
  .constant('Blob', window.Blob)
  .constant('URL', window.URL)
  .constant('scagnostics', window.scagnostics)
  .constant('scagnostics3D', window.scagnostics3D)
  .constant('scagnosticsnD', window.scagnosticsnD)
  .constant('jsondiffpatch', window.jsondiffpatch)
  .config(["consts", function(consts) {
    window.vg.util.extend(consts, {
      appId: 'pcagnosticsviz',
      // set this if you want to load app with a specific spec
      initialSpec: window.initialSpec || undefined,
      debugInList: false,
      logLevel: 'DEBUG',
      logToWebSql: false, // log user interactions (for user study)
      maxAnyShelf: 4
    });
  }])
  .config(["vl", function(vl) {
    vl.config.defaultConfig.countTitle = 'COUNT';
  }])
  .config(["uiZeroclipConfigProvider", function(uiZeroclipConfigProvider) {
    // config ZeroClipboard
    uiZeroclipConfigProvider.setZcConf({
      swfPath: 'bower_components/zeroclipboard/dist/ZeroClipboard.swf'
    });
  }])
  .config(["localStorageServiceProvider", function(localStorageServiceProvider) {
    localStorageServiceProvider.setPrefix('pcagnosticsviz');
  }])
  .config(["AnalyticsProvider", "consts", function (AnalyticsProvider, consts) {
    if (consts.embeddedData) return;
    AnalyticsProvider
      .setAccount({ tracker: 'UA-44428446-4', name: 'pcagnosticsviz', trackEvent: false });
  }]);

'use strict';

angular.module('pcagnosticsviz')
  // TODO: rename to Query once it's complete independent from Polestar
  .service('Wildcards', ["ANY", "vl", "cql", "Dataset", "Alerts", function(ANY, vl, cql, Dataset, Alerts) {
    var Wildcards = {
      list: null,
      addItem: addItem,
      addField: addField,
      removeItem: removeItem,
      removeField: removeField
    };

    function reset() {
      Wildcards.list = [
        {
          title: 'Categorical Fields',
          field: '?',
          type: {enum: [vl.type.NOMINAL, vl.type.ORDINAL]},
          immutable: true
        },
        {
          title: 'Temporal Fields',
          field: '?',
          type: vl.type.TEMPORAL,
          immutable: true
        },
        {
          title: 'Quantitative Fields',
          field: '?',
          type: vl.type.QUANTITATIVE,
          immutable: true
        }
      ];
    }
    reset();

    Dataset.onUpdate.push(reset);

    function addItem(fieldDef) {
      var wildcard = {
        title: null,
        field: {enum: []},
        type: {enum: []}
      };
      addField(wildcard, fieldDef, true);

      Wildcards.list.push(wildcard);

      return wildcard;
    }

    function pushIfNotExist(array, item) {
      if (array.indexOf(item) === -1) {
        array.push(item);
      }
    }

    function addField(wildcard, fieldDef, allowMixingType) {
      // Augment type
      // Since our wildcard are always created by addItem() method,
      // it is always an enum spec.
      if (allowMixingType) {
        if (cql.enumSpec.isEnumSpec(fieldDef.type)) {
          fieldDef.type.enum.forEach(function(type) {
            pushIfNotExist(wildcard.type.enum, type);
          });
        } else {
          pushIfNotExist(wildcard.type.enum, fieldDef.type);
        }
      } else {
        if (cql.enumSpec.isEnumSpec(fieldDef.type)) {
          var typeMissing = vl.util.some(fieldDef.type.enum, function(type) {
            return !vl.util.contains(wildcard.type.enum, type);
          });
          if (typeMissing) {
            Alerts.add('Cannot create a wildcard that mixes multiple types');
            return;
          }
        } else {
          if (!vl.util.contains(wildcard.type.enum, fieldDef.type)) {
            Alerts.add('Cannot create a wildcard that mixes multiple types');
            return;
          }
        }
      }

      // Augment aggregate(count) and field
      if (cql.enumSpec.isEnumSpec(fieldDef.field)) {
        if (fieldDef.field.enum) {
          fieldDef.field.enum.forEach(function(field) {
            pushIfNotExist(wildcard.field.enum, field);
          });
        } else { // Preset wildcard
          Dataset.schema.fieldSchemas.forEach(function(fieldSchema) {
            if (wildcard.type.enum ?
                  vl.util.contains(wildcard.type.enum, fieldSchema.type) :
                  fieldSchema.type === wildcard.type
               ) {
              pushIfNotExist(wildcard.field.enum, fieldSchema.field);
            }
          });
        }
      } else if (fieldDef.aggregate === 'count') {
        wildcard.aggregate = {enum: [undefined, 'count']};
        pushIfNotExist(wildcard.field.enum, '*');
      } else { // general fieldDef
        pushIfNotExist(wildcard.field.enum, fieldDef.field);
      }

      return wildcard; // support chaining
    }

    function removeItem(wildcard) {
      var index = Wildcards.list.indexOf(wildcard);
      Wildcards.list.splice(index, 1);
    }

    function removeField(wildcard, index) {
      var removedField = wildcard.field.enum.splice(index, 1);
      if (removedField === '*') {
        delete wildcard.aggregate;
      }
      if (wildcard.field.enum.length === 0) {
        removeItem(wildcard);
      }
    }

    return Wildcards;
  }]);

'use strict';

/**
 * @ngdoc service
 * @name pcagnosticsviz.Spec
 * @description
 * # Spec
 * Service in the pcagnosticsviz.
 */
angular.module('pcagnosticsviz')
  // TODO: rename to Query once it's complete independent from Polestar
  .service('Spec', ["ANY", "_", "vg", "vl", "cql", "util", "ZSchema", "consts", "NotifyingService", "Alerts", "Alternatives", "Chart", "Config", "Dataset", "Logger", "Pills", "Schema", "Wildcards", "FilterManager", "PCAplot", function(ANY, _, vg, vl, cql, util, ZSchema, consts,NotifyingService,
      Alerts, Alternatives, Chart, Config, Dataset, Logger, Pills, Schema, Wildcards, FilterManager, PCAplot) {

    var keys =  _.keys(Schema.schema.definitions.Encoding.properties).concat([ANY+0]);

    function instantiate() {
      return {
        data: Config.data,
        transform: {
          filterInvalid: undefined
        },
        mark: ANY,
        encoding: keys.reduce(function(e, c) {
          e[c] = {};
          return e;
        }, {}),
        config: Config.config,
        groupBy: 'auto',
        autoAddCount: false
      };
    }

    var Spec = {
      /** @type {Object} verbose spec edited by the UI */
      spec: null,
      /** Spec that we are previewing */
      previewedSpec: null,
      /** Spec that we can instantiate */
      emptySpec: instantiate(),
      /** @type {Query} */
      query: null,
      isSpecific: true,
      charts: null,
      chart: Chart.getChart(null),
      isEmptyPlot: true,
      alternatives: [],
      histograms: null,
      instantiate: instantiate,
      groupByLabel: {
        field: 'Showing views with different fields',
        fieldTransform: 'Showing views with different fields and transforms',
        encoding: 'Showing views with different encodings',
      },
      autoGroupBy: null,
        isSelected:false,
    };


    Spec._removeEmptyFieldDefs = function(spec) {
      spec.encoding = _.omit(spec.encoding, function(fieldDef, channel) {
        return !fieldDef || (fieldDef.field === undefined && fieldDef.value === undefined) ||
          (spec.mark && ! vl.channel.supportMark(channel, spec.mark));
      });
    };

    function deleteNulls(obj) {
      for (var prop in obj) {
        if (_.isObject(obj[prop])) {
          deleteNulls(obj[prop]);
        }
        // This is why I hate js
        if (obj[prop] === null ||
          obj[prop] === undefined ||
          (
            // In general, {} should be removed from spec. bin:{} is an exception.
            _.isObject(obj[prop]) &&
            vg.util.keys(obj[prop]).length === 0 &&
            prop !== 'bin'
          ) ||
          obj[prop] === []) {
          delete obj[prop];
        }
      }
    }

    function parse(spec) {
      var oldSpec = util.duplicate(spec);
      var oldFilter = null;

      if (oldSpec) {
        // Store oldFilter, copy oldSpec that exclude transform.filter
        oldFilter = (oldSpec.transform || {}).filter;
        var transform = _.omit(oldSpec.transform || {}, 'filter');
        oldSpec = _.omit(oldSpec, 'transform');
        if (transform) {
          oldSpec.transform = transform;
        }
      }

      var newSpec = vl.util.mergeDeep(instantiate(), oldSpec);

      // This is not Vega-Lite filter object, but rather our FilterModel
      newSpec.transform.filter = FilterManager.reset(oldFilter);

      return newSpec;
    }

    // takes a partial spec
    Spec.parseSpec = function(newSpec) {
      // TODO: revise this
      Spec.spec = parse(newSpec);
    };

    Spec.reset = function(hard) {
      var spec = instantiate();
      spec.transform.filter = FilterManager.reset(null, hard);
      Spec.spec = spec;
       // Spec.plot(Dataset);
    };

    /**
     * Takes a full spec, validates it and then rebuilds all members of the chart object.
     */
    Spec.update = function(spec) {
        if (Spec.previewedSpec!=null && !Spec.isSelected) return Spec;
        try {PCAplot.calscagnotic(Dataset.schema.fieldSchemas.map(function(d){return d.field}));}
        catch(e){}
        var dim = 0;
        var fields = [];
        for (var key in spec.encoding) {
            if (spec.encoding[key].field!== undefined && spec.encoding[key].field !== "*") {
                dim++;
                fields.push(spec.encoding[key].field);
            }
        }
        dim = (dim<1)?0:(dim-1);
        var data;
        if (dim==0)
            data = Dataset.data;
        if( dim==1) {
            //PCAplot.calscagnotic(fields);
            data = Dataset.schema.fieldSchemas.map(function(d){
                var tem = {field: d.field};
                tem[d.field] = d.scag;
                return tem;});
        }

        //if (PCAplot.mainfield != fields[0]){
        if (PCAplot.dim != dim && dim <2){
            PCAplot.firstrun = true;
        }
        PCAplot.dim = dim;
        PCAplot.plot(data,dim);
        spec = PCAplot.checkRender(spec,fields);
        spec = _.cloneDeep(spec || Spec.spec);


      Spec._removeEmptyFieldDefs(spec);
      deleteNulls(spec);

      if (spec.transform && spec.transform.filter) {
        delete spec.transform.filter;
      }

      spec.transform = spec.transform || {};

      var filter = FilterManager.getVlFilter();
      if (filter || spec.transform.filter) {
        spec.transform.filter = filter;
      }

      // we may have removed encoding
      if (!('encoding' in spec)) {
        spec.encoding = {};
      }
      if (!('config' in spec)) {
        spec.config = {};
      }
      // var validator = new ZSchema();
      // validator.setRemoteReference('http://json-schema.org/draft-04/schema', {});

      // var schema = Schema.schema;

      // ZSchema.registerFormat('color', function (str) {
      //   // valid colors are in list or hex color
      //   return /^#([0-9a-f]{3}){1,2}$/i.test(str);
      //   // TODO: support color name
      // });
      // ZSchema.registerFormat('font', function () {
      //   // right now no fonts are valid
      //   return false;
      // });

      // // now validate the spec
      // var valid = validator.validate(spec, schema);

      // if (!valid) {
      //   //FIXME: move this dependency to directive/controller layer
      //   Alerts.add({
      //     msg: validator.getLastErrors()
      //   });
      // } else {
        vg.util.extend(spec.config, Config.small());
        if (!Dataset.schema) { return Spec; }

        var query = Spec.cleanQuery = getQuery(spec);
        if (_.isEqual(query, Spec.oldCleanQuery)) {
          return Spec; // no need to update charts
        }
        Spec.oldCleanQuery = _.cloneDeep(query);
        var output = cql.query(query, Dataset.schema);
        Spec.query = output.query;
        var topItem = output.result.getTopSpecQueryModel();
        Spec.isEmptyPlot = !Spec.query || Spec.query.spec.encodings.length === 0;
        Spec.isSpecific = isAllChannelAndFieldSpecific(topItem, Spec.isEmptyPlot);
        Spec.alternatives = [];


        if (Spec.isSpecific || Spec.isEmptyPlot) {
          Spec.chart = Chart.getChart(topItem);
          Spec.charts = null;

          if (Dataset.schema) {
            if (query.spec.encodings.length > 0) {
              //Spec.alternatives = Alternatives.getAlternatives(query, Spec.chart, topItem);
              //   if (Spec.spec.config.typer){
                    PCAplot.madeprop(Spec.chart);
            } else {
              //Spec.alternatives = Alternatives.getHistograms(query, Spec.chart, topItem);
            }
          }
        } else if (topItem) {
          //Spec.charts = output.result.items.map(Chart.getChart);
          Spec.chart = Chart.getChart(null);
        } else {
          Spec.charts = null;
          Spec.chart = null;
        }
        // if (Spec.isSpecific) {
        //     /*PCAplot.alternativeupdate(Spec.spec);*/
        //     Spec.charts = null;
        //     Spec.chart = null;
        // }
      // }
        //console.log(Spec.alternatives);
        Spec.isSelected = false; // finish action select
      return Spec;
    };

    function isAllChannelAndFieldSpecific(topItem, isEmptyPlot) {
      if (!topItem) {
        return isEmptyPlot; // If it's specific no way we get empty result!
      }
      var enumSpecIndex = topItem.enumSpecIndex;
      return util.keys(enumSpecIndex.encodingIndicesByProperty).length === 0;
    }



    Spec.preview = function(enable, chart, listTitle) {
      if (enable) {
        if (!chart) return;
        var spec = chart.vlSpec;
        Spec.previewedSpec = parse(spec);

        Logger.logInteraction(Logger.actions.SPEC_PREVIEW_ENABLED, chart.shorthand, {
          list: listTitle
        });
      } else {
        if (Spec.previewedSpec !== null) {
          // If it's already null, do nothing.  We have multiple even triggering preview(null)
          // as sometimes when lagged, the unpreview event is not triggered.
          Spec.previewedSpec = null;
          Logger.logInteraction(Logger.actions.SPEC_PREVIEW_DISABLED, chart.shorthand, {
            list: listTitle
          });
        }
      }
    };
    Spec.previewQuery = function(enable, query, listTitle) {
      if (enable) {
        if (!query) return;
        Spec.previewedSpec = parseQuery(query);

        Logger.logInteraction(Logger.actions.SPEC_PREVIEW_ENABLED, cql.query.shorthand.spec(query.spec), {
          list: listTitle
        });
      } else {
        if (Spec.previewedSpec !== null) {
          // If it's already null, do nothing.  We have multiple even triggering preview(null)
          // as sometimes when lagged, the unpreview event is not triggered.
          Spec.previewedSpec = null;
          Logger.logInteraction(Logger.actions.SPEC_PREVIEW_DISABLED, cql.query.shorthand.spec(query.spec), {
          list: listTitle
        });
        }
      }
    };

    function getSpecQuery(spec, convertFilter /*HACK*/) {
      if (convertFilter) {
        spec = util.duplicate(spec);


        // HACK convert filter manager to proper filter spec
        if (spec.transform && spec.transform.filter) {
          delete spec.transform.filter;
        }

        var filter = FilterManager.getVlFilter();
        if (filter) {
          spec.transform = spec.transform || {};
          spec.transform.filter = filter;
        }
      }

      return {
        data: Config.data,
        mark: spec.mark === ANY ? '?' : spec.mark,
        type: spec.type,
        // TODO: support transform enumeration
        transform: spec.transform,
        encodings: vg.util.keys(spec.encoding).reduce(function(encodings, channelId) {
          var encQ = vg.util.extend(
            // Add channel
            { channel: Pills.isAnyChannel(channelId) ? '?' : channelId },
            // Field Def
            spec.encoding[channelId],
            // Remove Title
            {title: undefined}
          );

          if (cql.enumSpec.isEnumSpec(encQ.field)) {
            // replace the name so we should it's the field from this channelId
            encQ.field = {
              name: 'f' + channelId,
              enum: encQ.field.enum
            };
          }

          encodings.push(encQ);
          return encodings;
        }, []),
        config: spec.config
      };
    }

    function parseQuery(query) {
      var specQuery = util.duplicate(query.spec);
      // Mark -> ANY
      var spec = instantiate();

      if (cql.enumSpec.isEnumSpec(specQuery.mark)) {
        spec.mark = ANY;
      } else {
        spec.mark = specQuery.mark;
      }

      spec.transform = _.omit(specQuery.transform || {}, 'filter');
      // This is not Vega-Lite filter object, but rather our FilterModel
      spec.transform.filter = FilterManager.reset(specQuery.transform.filter);

      var anyCount = 0;

      var encoding = specQuery.encodings.reduce(function(e, encQ) {
        // Channel -> ANY0, ANY1
        var channel = cql.enumSpec.isEnumSpec(encQ.channel) ? ANY + (anyCount++) : encQ.channel;
        e[channel] = encQ;
        return e;
      }, {});
      spec.encoding = vl.util.mergeDeep(spec.encoding, encoding);
      spec.config = specQuery.config;

      spec.groupBy = 'auto'; // query.groupBy;
      spec.orderBy =  specQuery.orderBy;
      spec.autoAddCount = (query.config || {}).autoAddCount;
      return spec;
    }

    function getQuery(spec, convertFilter /*HACK */) {
      var specQuery = getSpecQuery(spec, convertFilter);

      var hasAnyField = false, hasAnyFn = false, hasAnyChannel = false;

      for (var i = 0; i < specQuery.encodings.length; i++) {
        var encQ = specQuery.encodings[i];
        if (encQ.autoCount === false) continue;

        if (cql.enumSpec.isEnumSpec(encQ.field)) {
          hasAnyField = true;
        }

        if (cql.enumSpec.isEnumSpec(encQ.aggregate) ||
            cql.enumSpec.isEnumSpec(encQ.bin) ||
            cql.enumSpec.isEnumSpec(encQ.timeUnit)) {
          hasAnyFn = true;
        }

        if (cql.enumSpec.isEnumSpec(encQ.channel)) {
          hasAnyChannel = true;
        }
      }

      /* jshint ignore:start */
      var groupBy = spec.groupBy;

      if (spec.groupBy === 'auto') {
        groupBy = Spec.autoGroupBy = hasAnyField ?
          (hasAnyFn ? 'fieldTransform' : 'field') :
          'encoding';
      }

      return {
        spec: specQuery,
        groupBy: groupBy,
        orderBy: ['fieldOrder', 'aggregationQuality', 'effectiveness'],
        chooseBy: ['aggregationQuality', 'effectiveness'],
        config: {
          omitTableWithOcclusion: false,
          autoAddCount: (hasAnyField || hasAnyFn || hasAnyChannel) && spec.autoAddCount
        }
      };
      /* jshint ignore:end */
    }

    function instantiatePill(channel) { // jshint ignore:line
      return {};
    }

    /** copy value from the pill to the fieldDef */
    function updateChannelDef(encoding, pill, channel){
      var type = pill.type;
      var supportedRole = Pills.isAnyChannel(channel) ?
        {measure: true, dimension : true} :
        vl.channel.getSupportedRole(channel);
      var dimensionOnly = supportedRole.dimension && !supportedRole.measure;

      // auto cast binning / time binning for dimension only encoding type.
      if (pill.field && dimensionOnly) {
        if (pill.aggregate==='count') {
          pill = {};
        } else if (type === vl.type.QUANTITATIVE && !pill.bin) {
          pill.aggregate = undefined;
          pill.bin = {maxbins: vl.bin.MAXBINS_DEFAULT};
        } else if(type === vl.type.TEMPORAL && !pill.timeUnit) {
          pill.timeUnit = consts.defaultTimeFn;
        }
      } else if (!pill.field) {
        // no field, it's actually the empty shelf that
        // got processed in the opposite direction
        pill = {};
      }

      // filter unsupported properties
      var fieldDef = instantiatePill(channel),
        shelfProps = Schema.getChannelSchema(channel).properties;

      for (var prop in shelfProps) {
        if (pill[prop]) {
          if (prop==='value' && pill.field) {
            // only copy value if field is not defined
            // (which should never be the case)
            delete fieldDef[prop];
          } else {
            //FXIME In some case this should be merge / recursive merge instead ?
            fieldDef[prop] = pill[prop];
          }
        }
      }
      encoding[channel] = fieldDef;
    }

    function addNewAnyChannel(encoding) {
      var newAnyChannel = Pills.getNextAnyChannelId();
      if (newAnyChannel !== null) {
        updateChannelDef(encoding, {}, newAnyChannel);
      }
    }


    Pills.listener = {
      set: function(channelId, pill) {
        updateChannelDef(Spec.spec.encoding, pill, channelId);
      },
      remove: function(channelId) {
        if (Pills.isAnyChannel(channelId)) {
          // For ANY channel, completely remove it from the encoding
          delete Spec.spec.encoding[channelId];
          // Check if we remove the last available any channel shelf
          var emptyAnyChannel = Pills.getEmptyAnyChannelId();
          if (!emptyAnyChannel) {
            // if so, add one back!
            addNewAnyChannel(Spec.spec.encoding);
          }
        } else {
          // For typically channels, remove all pill detail from the fieldDef, but keep the object
          updateChannelDef(Spec.spec.encoding, {}, channelId);
        }
      },
      add: function(fieldDef) {
        var oldMarkIsEnumSpec = cql.enumSpec.isEnumSpec(Spec.cleanQuery.spec.mark);

        Logger.logInteraction(Logger.actions.ADD_FIELD, fieldDef, {
          from: cql.query.shorthand.spec(Spec.query.spec)
        });

        if (Spec.isSpecific && !cql.enumSpec.isEnumSpec(fieldDef.field)) {
          // Call CompassQL to run query and load the top-ranked result
          var specQuery = Spec.cleanQuery.spec;
          var encQ = _.extend(
            {},
            fieldDef,
            {
              channel: cql.enumSpec.SHORT_ENUM_SPEC
            },
            fieldDef.aggregate === 'count' ? {} : {
              aggregate: cql.enumSpec.SHORT_ENUM_SPEC,
              bin: cql.enumSpec.SHORT_ENUM_SPEC,
              timeUnit: cql.enumSpec.SHORT_ENUM_SPEC
            }
          );
          specQuery.encodings.push(encQ);

          var query = {
            spec: specQuery,
            groupBy: ['field', 'aggregate', 'bin', 'timeUnit', 'stack'],
            orderBy: 'aggregationQuality',
            chooseBy: 'effectiveness',
            config: {omitTableWithOcclusion: false}
          };

          var output = cql.query(query, Dataset.schema);
          var result = output.result;

          var topItem = result.getTopSpecQueryModel();

          if (!topItem) {
            // No Top Item
            Alerts.add('Cannot automatically adding this field anymore');
            return;
          }

          // The top spec will always have specific mark.
          // We need to restore the mark to ANY if applicable.
          var topSpec = topItem.toSpec();
          if (oldMarkIsEnumSpec) {
            topSpec.mark = ANY;
          }
          Spec.parseSpec(topSpec);
        } else {
          var encoding = _.clone(Spec.spec.encoding);
          // Just add to any channel because CompassQL do not support partial filling yet.
          var emptyAnyChannel = Pills.getEmptyAnyChannelId();

          if (!emptyAnyChannel) {
            Alerts.add('You cannot add too many fields to the wildcard shelves!');
            return;
          }

          updateChannelDef(encoding, _.clone(fieldDef), emptyAnyChannel);

          // Add new any as a placeholder
          addNewAnyChannel(encoding);

          Spec.spec.encoding = encoding;
        }

      },
      select: function(spec) {
       //  var specQuery = getSpecQuery(spec);
       //  specQuery.mark = '?';
       // var copyspec =  util.duplicate(specQuery);
       // delete copyspec.config.cell;
       //  //console.log(copyspec);
       //  var query = {
       //    spec: copyspec,
       //    chooseBy: 'effectiveness'
       //  };
       //  var output = cql.query(query, Dataset.schema);
       //  var result = output.result;

        // if (result.getTopSpecQueryModel().getMark() === spec.mark) {
        //   // make a copy and replace mark with '?'
        //   spec = util.duplicate(spec);
        //   //delete spec.config.cell;
        //   spec.mark = ANY;
        // }

        // if (spec.config.typer){
        //   console.log(spec);
        //     PCAplot.madeprop(spec);
        // }
        Spec.isSelected = true;
        Spec.parseSpec(spec);

      },
      selectQuery: function(query) {
        Spec.spec = parseQuery(query);
      },
      parse: function(spec) {
        Spec.parseSpec(spec);
      },
      preview: Spec.preview,
      previewQuery: Spec.previewQuery,
      update: function(spec) {
        //spec = PCAplot.checksupport(spec,fields);
        //if (PCAplot.mspec!=null) PCAplot.alternativeupdate();
        return Spec.update(spec);
      },
      reset: function() {
        Spec.reset();
      },
      dragDrop: function(cidDragTo, cidDragFrom) {
        // Make a copy and update the clone of the encoding to prevent glitches
        var encoding = _.clone(Spec.spec.encoding);
        // console.log('dragDrop', encoding, Pills, 'from:', cidDragFrom, Pills.get(cidDragFrom));

        // If pill is dragged from another shelf, not the schemalist
        if (cidDragFrom) {
          // console.log('pillDragFrom', Pills.get(cidDragFrom));
          if (Pills.isAnyChannel(cidDragFrom) && !Pills.isAnyChannel(cidDragTo)) {
            // For Dragging a pill ANY channel to non-ANY channel,
            // we can  completely remove it from the encoding
            delete encoding[cidDragFrom];
          } else {
            // For typically channels, replace the pill or
            // remove all pill detail from the fieldDef but keep the object
            updateChannelDef(encoding, Pills.get(cidDragFrom) || {}, cidDragFrom);
          }
        }

        var pillDragToWasEmpty = !(encoding[cidDragTo] || {}).field;
        updateChannelDef(encoding, Pills.get(cidDragTo) || {}, cidDragTo);
        // console.log('Pills.dragDrop',
          // 'from:', cidDragFrom, Pills.get(cidDragFrom), encoding[cidDragFrom],
          // 'to:', cidDragTo, Pills.get(cidDragTo), encoding[cidDragTo]);

        // If a pill is dragged from non-ANY channel to an empty ANY channel
        if (Pills.isAnyChannel(cidDragTo) && pillDragToWasEmpty) {
          if (!cidDragFrom || !Pills.isAnyChannel(cidDragFrom)) {
            // If drag new field from schema or from normal shelf, add new any
            addNewAnyChannel(encoding);
          }
        }

        // Finally, update the encoding only once to prevent glitches
        Spec.spec.encoding = encoding;
          // Spec.spec = PCAplot.checksupport(Spec.spec);
      },
      rescale: function (channelId, scaleType) {
        var fieldDef = Spec.spec.encoding[channelId];
        if (fieldDef.scale) {
          fieldDef.scale.type = scaleType;
        } else {
          fieldDef.scale = {type: scaleType};
        }
      },
      sort: function(channelId, sort) {
        Spec.spec.encoding[channelId].sort = sort;
      },
      transpose: function() {
        Chart.transpose(Spec.spec);
      },
      isEnumeratedChannel: function(channelId) {
        return Spec.spec.encoding[channelId] && !Spec.spec.encoding[channelId].field;
      },
      isEnumeratedField: function(channelId) {
        return Spec.spec.encoding[channelId] && cql.enumSpec.isEnumSpec(Spec.spec.encoding[channelId].field);
      },
      toggleFilterInvalid: function () {
        Spec.spec.transform.filterInvalid = Spec.spec.transform.filterInvalid ? undefined : true;
      },
      addWildcard: Wildcards.addItem,
      addWildcardField: Wildcards.addField,
      removeWildcard: Wildcards.removeItem,
      removeWildcardField: Wildcards.removeField,
    };

    Spec.reset();
    Dataset.onUpdate.push(function() {
      Spec.reset(true);

    });

    return Spec;
  }]);
angular.module('pcagnosticsviz').factory('NotifyingService', ["$rootScope", function($rootScope) {
    return {
        subscribe: function(scope, callback) {
            var handler = $rootScope.$on('notifying-service-event', callback);
            scope.$on('$destroy', handler);
        },

        notify: function() {
            $rootScope.$emit('notifying-service-event');
        }
    };
}]);
'use strict';
angular.module('pcagnosticsviz')
    .factory("scagworker",['$q',function($q){

        var worker = new Worker('scagworker.js');
        var defer = $q.defer();
        worker.addEventListener('message', function(e) {
            console.log('Worker said: ', e.data);
            defer.resolve(e.data);
        }, false);
        var scagWork = {};
        scagWork.scag2D = function(myData){
            defer = $q.defer();
            worker.postMessage({action: '2D',data: myData}); // Send data to our worker.
            return defer.promise;
        };
        scagWork.scag3D = function(myData){
            defer = $q.defer();
            worker.postMessage({action: '3D',data: myData}); // Send data to our worker.
            return defer.promise;
        };
        scagWork.scagnD = function(myData){
            defer = $q.defer();
            worker.postMessage({action: 'nD',data: myData}); // Send data to our worker.
            return defer.promise;
        };
        return scagWork;

    }]);
'use strict';

angular.module('pcagnosticsviz')
    .factory('PCAplot', ["ANY", "Dataset", "_", "vg", "vl", "cql", "ZSchema", "Logger", "consts", "FilterManager", "Pills", "NotifyingService", "Alternatives", "ngAnimate", "Chart", "Config", "Schema", "util", "GuidePill", "Webworker", function(ANY,Dataset,_, vg, vl, cql, ZSchema,Logger, consts,FilterManager ,Pills,NotifyingService,Alternatives, ngAnimate,Chart,Config,Schema,util,GuidePill, Webworker) {
        var keys =  _.keys(Schema.schema.definitions.Encoding.properties).concat([ANY+0]);
        var colordot = '#4682b4';
        var states = {IDLE:0,GENERATE_GUIDE:1,GENERATE_ALTERNATIVE:2,FREE:3, UPDATEPOSITION:4};
        var limitDefault = Infinity;
        function instantiate() {
            return {
                data: Config.data,
                transform: {
                },
                mark: 'bar',
                encoding: keys.reduce(function(e, c) {
                    e[c] = {};
                    return e;
                }, {}),
                config: Config.config,
                groupBy: 'auto',
                orderBy: 'auto',
                autoAddCount: false,
                type: 'auto'
            };
        }

        var PCAplot = {
            dataencde: null,
            alternatives: [],
            autoGroupBy: null,
            spec: null,
            firstrun:true,
            chart:null,
            charts:[],
            mainfield: null,
            prop:null,
            dim: 0,
            dataref:[],
            limit: 10,
            mspec:null,
            limitup: 0,
            state:states.IDLE,
        };
        PCAplot.mark2plot = mark2plot;
        var abtractionLevel =['Individual instances','Regular binning','Data-dependent binning','Abtracted'];
        var support =[{
            types : ['outlier','variance', 'multimodality', 'skewness'],
            marks : ['tick','bar','area','boxplot'],
            option : 'auto',
            getmark: getmark
        }, {
            types : ['outlying','sparse','clumpy','skewed','striated','convex','skinny','stringy','monotonic'],
            marks :['point','hexagon','leader','contour'],
            option : 'auto',
            getmark: getmark
        }, {
            types : ['outlying','sparse','clumpy','skewed'],
            marks :['scatter3D-point','scatter3D-evenbin','scatter3D','scatter3D-contour'],
            option : 'auto',
            getmark: getmark
        }, {
            types : ['outlying'],
            marks :['radar','radar-evenbin','radar-leader','radar-contour'],
            option : 'auto',
            getmark: getmark
        }];
        support.getsupport = function(dim){
            var supportdim = ( dim> (support.length-1))?(support.length-1):dim;
            return support[supportdim];
        };
        //PCAplot.updateplot = function (data){};
        PCAplot.plot =function(dataor,dimension) {
            if (!Object.keys(Config.data).length){return PCAplot;}
            if (!PCAplot.firstrun && (Dataset.currentDataset[Object.keys(Config.data)[0]]===Config.data[Object.keys(Config.data)[0]])) {return PCAplot;}
            //console.log("PLOT!!!!");
            PCAplot.firstrun = false;
            // d3.select('#bi-plot').selectAll('g').remove();

            // Biplot.data;
            //var data = Dataset.data);
            if (typeof dataor !=='undefined' ) {
                PCAplot.data = [Dataset.schema.fieldSchemas, PCAplot.dataref];
                var biplotselect = $('.biplot');
                var data = _.cloneDeep(dataor);
                var margin = {top: 20, right: 20, bottom: 20, left: 20};
                var width = biplotselect.width() - margin.left - margin.right;
                var height = biplotselect.width() - margin.top - margin.bottom;
                var angle = Math.PI * 0;
//var color = d3.scaleOrdinal(d3.schemeCategory10);
                var color = d3.scale.category10();
                var x = d3.scale.linear().range([0, width]); // switch to match how R biplot shows it
                var y = d3.scale.linear().range([height, 0]);
                var rdot = 2;
                // sub space
                var submarign = {top: 5, right: 5, bottom: 5, left: 5};
                var subgSize = {
                    w: (40 - submarign.left - submarign.right),
                    h: (40 - submarign.top - submarign.bottom),
                };
                var subx = d3.scale.linear().range([submarign.left, subgSize.w + submarign.left]).domain([0, 1]); // switch to match how R biplot shows it
                var suby = d3.scale.linear().range([submarign.top + subgSize.h, submarign.top]).domain([0, 1]);

                var svg_main = d3.select("#bi-plot")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)
                ;
                var menu = svg_main.select('#bi-plot');
                var svg = svg_main.select("#bi-plot-g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
                // svg_main
                //     .call(d3.behavior.zoom().on("zoom", function () {
                //             svg.attr("transform", "translate(" + d3.event.translate + ")" + " scale(" + d3.event.scale + ")");
                //     }));
                svg_main.select('.overlay')
                    .attr('width',width+margin.left+margin.right)
                    .attr('height',height+margin.top+margin.bottom)
                    .style('fill','none');
                var g_axis = svg.select("#bi-plot-axis");
                var g_point = svg.select("#bi-plot-point");
                var idlabel = [],
                    brand_names = [],
                    matrix = [],
                    outlier = [];
                var dataref = null;
                if (dimension === 0) {

                    brand_names = Dataset.schema._fieldSchemas.filter(d=>(d.type!=="temporal"&& d.primitiveType!=="string")).map(d=>d.field);
                    matrix = data2Num(data,brand_names);

                    outlier = brand_names.map(function (d, i) {
                        // var outliernum = 0,
                        //     row = matrix.map(function (r) {
                        //         return r[i]
                        //     }),
                        //     q1 = ss.quantile(row, 0.25),
                        //     q3 = ss.quantile(row, 0.75),
                        //     iqr = (q3 - q1) * 1.5;
                        // //iqr = Dataset.schema.fieldSchema(d).stats.stdev*1.35;
                        // // console.log('q1: '+q1+'q3: '+q3+'iqr: '+iqr);
                        // Dataset.schema.fieldSchema(d).stats.q1 = q1;
                        // Dataset.schema.fieldSchema(d).stats.q3 = q3;
                        // Dataset.schema.fieldSchema(d).stats.q1iqr = Math.max(q1 - iqr, ss.min(row));
                        // Dataset.schema.fieldSchema(d).stats.q3iqr = Math.min(q3 + iqr, ss.max(row));
                        // Dataset.schema.fieldSchema(d).stats.iqr = iqr;
                        // //console.log(Dataset.schema.fieldSchema(d).stats);
                        // row.forEach(function (e) {
                        //     if ((e < q1 - 2 * iqr) || (e > q3 + 2 * iqr))
                        //         outliernum += 10;
                        //     else if ((e < q1 - iqr) || (e > q3 + iqr))
                        //         outliernum = outliernum + 1;
                        // });
                        if (Dataset.schema.fieldSchema(d).type !== "quantitative") {
                            Dataset.schema.fieldSchema(d).stats.outlier = 0;
                            Dataset.schema.fieldSchema(d).stats.variance = 0;
                            Dataset.schema.fieldSchema(d).stats.modeskew = 0;
                            Dataset.schema.fieldSchema(d).stats.multimodality = 0;
                        }
                        return Dataset.schema.fieldSchema(d).stats.outlier;
                    });
                    var outlier_scale = d3v4.scaleLinear().domain(d3.extent(outlier)).range([0,1]);
                    outlier = outlier.map(o=>outlier_scale(o));
                }
                else {
                    var newdata = [];
                    data.forEach(function (d) {
                        for (var e in d[d.field]) {
                            if (d[d.field][e].invalid !== 1) {
                                idlabel.push([d.field, e]);
                                newdata.push(d[d.field][e]);
                            }
                        }
                    });
                    data = newdata
                    .filter(function (d) {
                        return !d.invalid // FIX ME
                    }); // for overview 2D
                    // idlabel = Object.keys(data);
                    //brand_names = Object.keys(data[idlabel[0]]);
                    brand_names = Object.keys(data[0]).filter(function (d) {
                        return d !== "label";
                    });
                    // data = d3.values(data);
                    matrix = data.map(function (d) {
                        return brand_names.map(b=>d[b])
                    });
                    //console.log(data);
                    // if (brand_names < 9) {
                    //     data.forEach(function (d, i) {
                    //         d.label = idlabel[i];
                    //         d.pc1 = 0;
                    //         d.pc2 = 0;
                    //     });
                    //     dataref = _.cloneDeep(data);
                    //     var brands = brand_names
                    //         .map(function (key, i) {
                    //             return {brand: key, pc1: 0, pc2: 0}
                    //         });
                    //     PCAplot.estimate(brands, dimension, dataref);
                    // }

                }
                try{
                var pca = new PCA();
                // console.log(brand_names);
                matrix = pca.scale(matrix, true, true);

                var pc = pca.pca(matrix, 2);

                var A = pc[0];  // this is the U matrix from SVD
                var B = pc[1];  // this is the dV matrix from SVD
                var chosenPC = pc[2];   // this is the most value of PCA
                data.forEach(function (d, i) {
                    d.pc1 = A[i][chosenPC[0]];
                    d.pc2 = A[i][chosenPC[1]];
                });
                if (dimension === 1) {
                    data.forEach(function (d, i) {
                        d.label = idlabel[i]
                    });
                    dataref = _.cloneDeep(data);
                    data = brand_names.map(function (d) {
                        var top = data.sort(function (a, b) {
                            return a[d] < b[d] ? 1 : -1;
                        })[0];
                        if (top[d] > 0.65) {
                            top.feature = d;
                            return top;
                        }
                    }).filter(function (d) {
                        return d !== undefined;
                    });
                }
                var maxxy = [-Infinity, -Infinity];
                var minxy = [Infinity, Infinity];
                //A.forEach(function(d){maxxy=Math.max(maxxy,Math.abs(d[0]),Math.abs(d[1]));});
                maxxy = maxxy.map(function (d, i) {
                    return d3.max(data.map(function (e) {
                        return e['pc' + (i + 1)];
                    }));
                });
                minxy = minxy.map(function (d, i) {
                    return d3.min(data.map(function (e) {
                        return e['pc' + (i + 1)];
                    }));
                });
                var maxxyall = [0, 0];
                maxxyall = maxxyall.map(function (d, i) {
                    return Math.max(Math.abs(minxy[i]), Math.abs(maxxy[i]));
                });
                // var maxxy = d3.max(maxxyall);
                //     maxxyall[0] = maxxy;
                //     maxxyall[1] = maxxy;
                // x.domain([-maxxyall]).nice();
                // y.domain([minxy[1],maxxy[1]]).nice();
                x.domain([-maxxyall[0], maxxyall[0]]).nice();
                y.domain([-maxxyall[1], maxxyall[1]]).nice();
                var scale_axis = 0;
                B.forEach(function (i) {
                    scale_axis = Math.max(scale_axis, Math.sqrt(i[0] * i[0] + i[1] * i[1]))
                });
                var scale_axisx = maxxyall[0] / scale_axis;
                var scale_axisy = maxxyall[1] / scale_axis;
                var brands = brand_names
                    .map(function (key, i) {
                        return {
                            brand: key,
                            pc1: B[i][chosenPC[0]] * scale_axisx,
                            pc2: B[i][chosenPC[1]] * scale_axisy,
                            load_pc1: B[i][chosenPC[0]],
                            load_pc2: B[i][chosenPC[1]],
                        }
                    });
                // console.log(brands);


                data.forEach(function (d, i) {
                    var xy = rotate(d.pc1, d.pc2, angle);
                    d.pc1 = xy.x;
                    d.pc2 = xy.y;
                    d.vector = matrix[i];
                });

                brands.forEach(function (d, i) {
                    var xy = rotate(d.pc1, d.pc2, angle);
                    d.pc1 = xy.x;
                    d.pc2 = xy.y;

                    if (dimension === 0) {
                        d.outlier = outlier[i];
                        d.skew = Dataset.schema.fieldSchema(d.brand).stats.modeskew;
                        d.variance = Dataset.schema.fieldSchema(d.brand).stats.variance;
                    }
                });
                //update to calculate
                PCAplot.estimate(brands, dimension, dataref);
                // draw
                var onMouseOverAttribute = function (a, j) {
                    brands.forEach(function (b, idx) {
                        var A = {x: 0, y: 0};
                        var B = {x: b.pc1, y: b.pc2};
                        var C = {x: a.pc1, y: a.pc2};
                        //var C = { x: a.vector[idx],  y: a.vector[idx] };

                        b.D = getSpPoint(A, B, C);
                    });

                    svg.selectAll('.tracer')
                        .data(brands)
                        .enter()
                        .append('line')
                        .attr('class', 'tracer tips')
                        .attr('x1', function (b, i) {
                            return x(a.pc1);
                            return x1;
                        })
                        .attr('y1', function (b, i) {
                            return y(a.pc2);
                            return y1;
                        })
                        .attr('x2', function (b, i) {
                            return x(b.D.x);
                            return x2;
                        })
                        .attr('y2', function (b, i) {
                            return y(b.D.y);
                            return y2;
                        })
                        .style("stroke", function (d) {
                            return "#ff6f2b"
                        });

                    delete a.D;
                    var ca = _.cloneDeep(a);
                    delete ca.pc1;
                    delete ca.pc2;
                    delete ca.vector;
                    var tipText = d3.entries(ca);
                    // console.log(a);
                    tip.show(tipText, "");
                };

// draw line from the brand axis a perpendicular to each attribute b
                var legendtop = svg_main.selectAll('.legendtop').data([''])
                    .enter().append('text')
                    .text(function (d) {
                        return d
                    }).attr('class','legendtop')
                    .attr('text-anchor', 'end')
                    .attr('y', height + margin.bottom / 2)
                    .attr('x', width);
                var onMouseOverBrand = function (b, j) {

                    data.forEach(function (a, idx) {
                        var A = {x: 0, y: 0};
                        var B = {x: b.pc1, y: b.pc2};
                        var C = {x: a.pc1, y: a.pc2};
                        // var C = { x: a.vector[j],  y: a.vector[j] };

                        a.D = getSpPoint(A, B, C);
                    });

                    var tracer = svg.selectAll('.tracer')
                        .data(data)
                        .enter();
                    tracer
                        .append('line')
                        .attr('class', 'tracer tips')
                        .attr('x1', function (a, i) {
                            return x(a.D.x);
                        })
                        .attr('y1', function (a, i) {
                            return y(a.D.y);
                        })
                        .attr('x2', function (a, i) {
                            return x(a.pc1);
                        })
                        .attr('y2', function (a, i) {
                            return y(a.pc2);
                        })
                        .style("stroke", function (d) {
                            return "#aaa"
                        });

                    tracer
                        .append('circle')
                        .attr('class', 'tracer-c tips')
                        .attr('cx', function (a, i) {
                            return x(a.D.x);
                        })
                        .attr('cy', function (a, i) {
                            return y(a.D.y);
                        })
                        .attr('r', 5)
                        .style("fill", function (d) {
                            return "#ff6f2b"
                        })
                        .style("fill-opacity", 0.1);
                    console.log('Mouse over brand');
                    console.log(b.brand);
                    legendtop.data([b.brand]).text(function (d) {
                        return d;
                    });
                    /*var tipText = data.map(function(d) {
                        return {key: d[brand_names[0]], value: d[b['brand']] }
                    });*/

                    // call tip
                    /*var tipText ="";
                    tip.show(tipText, b.brand);*/

                    //add tip to head
                };

                var onMouseLeave = function (b, j) {
                    svg.selectAll('.tracer').remove();
                    svg.selectAll('.tracer-c').remove();
                    tip.hide();
                    legendtop.data(['']).text(function (d) {
                        return d;
                    });
                };
                if (dimension === 0) {
                    g_point.selectAll(".subgraph").remove();
                    var point = g_point.selectAll(".dot")
                        .data(data)
                        .attr("cx", function (d) {
                            return x(d.pc1);
                        })
                        .attr("cy", function (d) {
                            return y(d.pc2);
                        })
                        .style("fill", colordot)
                        .style("stroke", "black")
                        .style("stroke-width", 0.2)
                        .style("stroke-opacity", 0.5)
                        .style("fill-opacity", 0.6)
                        .on('mouseover', onMouseOverAttribute)
                        .on('mouseleave', onMouseLeave);
                    point.exit().remove();
                    point
                        .enter().append("circle")
                        .attr("class", "dot")
                        .attr("r", rdot)
                        .attr("cx", function (d) {
                            return x(d.pc1);
                        })
                        .attr("cy", function (d) {
                            return y(d.pc2);
                        })
                        .style("fill", colordot)
                        .style("stroke", "black")
                        .style("stroke-width", 0.5)
                        .style("fill-opacity", 0.6)
                        .on('mouseover', onMouseOverAttribute)
                        .on('mouseleave', onMouseLeave);
                } else {
                    g_point.selectAll(".dot").remove();
                    var subplot = g_point.selectAll(".subgraph")
                        .data(data)
                        .attr("class", "subgraph")
                        .attr('transform', function (d) {
                            return "translate(" + (x(d.pc1) - (subgSize.w + submarign.left + submarign.right) / 2) + "," + (y(d.pc2) - (subgSize.h + submarign.top + submarign.bottom) / 2) + ")"
                        })
                        .on('mouseover', onMouseOverAttribute)
                        .on('mouseleave', onMouseLeave);
                    subplot.exit().remove();
                    var subinside = subplot
                        .enter().append("g")
                        .attr("class", "subgraph")
                        .attr('transform', function (d) {
                            return "translate(" + (x(d.pc1) - (subgSize.w + submarign.left + submarign.right) / 2) + "," + (y(d.pc2) - (subgSize.h + submarign.top + submarign.bottom) / 2) + ")"
                        })
                        .on('mouseover', onMouseOverAttribute)
                        .on('mouseleave', onMouseLeave);
                    subinside.append("rect")
                        .attr("class", "backgroundSub")
                        .attr("width", subgSize.w + submarign.left + submarign.right)
                        .attr("height", subgSize.h + submarign.top + submarign.bottom)
                        .attr("x", 0)
                        .attr("y", 0);
                    var subpoint = subplot.selectAll(".point")
                        .data(function (d) {
                            //var datapoint = Dataset.data.map(function(it){return [it[PCAplot.mainfield],it[d.label]]});
                            var datapoint = Dataset.data.map(function (it) {
                                return [it[d.label[0]], it[d.label[1]]]
                            });
                            var datax = datapoint.map(function (d) {
                                return d[0]
                            });
                            var datay = datapoint.map(function (d) {
                                return d[1]
                            });
                            var maxx = d3.max(datax);
                            var minx = d3.min(datax);
                            var maxy = d3.max(datay);
                            var miny = d3.min(datay);
                            datapoint.forEach(function (d) {
                                d[0] = (d[0] - minx) / (maxx - minx);
                                d[1] = (d[1] - miny) / (maxy - miny);
                            });
                            return datapoint;
                        })
                        .attr("cx", function (d) {
                            return subx(d[0]);
                        })
                        .attr("cy", function (d) {
                            return suby(d[1]);
                        });
                    subpoint.exit().remove();
                    subpoint.enter()
                        .append("circle")
                        .attr("class", "point")
                        .attr("r", 1)
                        .attr("cx", function (d) {
                            return subx(d[0]);
                        })
                        .attr("cy", function (d) {
                            return suby(d[1]);
                        })
                        .style("fill", function (d) {
                            return '#4682b4';
                        })
                        .style('opacity', 0.8);
                }

                var circlebrand = g_axis.selectAll(".circle_brand")
                    .data(brands)
                    .attr("x", function (d) {
                        return x(d.pc1) - 2.5;
                    })
                    .attr("y", function (d) {
                        return y(d.pc2) - 2.5;
                    })
                    .style("fill", function (d) {
                        return color(d['brand']);
                    });
                circlebrand.exit().remove();
                circlebrand
                    .enter().append("rect")
                    .attr("class", "circle_brand")
                    .attr("width", 5)
                    .attr('height', 5)
                    .attr("x", function (d) {
                        return x(d.pc1) - 2.5;
                    })
                    .attr("y", function (d) {
                        return y(d.pc2) - 2.5;
                    })
                    .style("fill", function (d) {
                        return color(d['brand']);
                    });


                /*g_axis.selectAll("text.brand")
                    .data(brands)
                    .enter().append("text")
                    .attr("class", "label-brand")
                    .attr("x", function(d) { return x(d.pc1) + 10; })
                    .attr("y", function(d) { return y(d.pc2) + 0; })
                    .attr("visibility","hidden")
                    .text(function(d) { return d['brand']});*/
                //var deltaX, deltaY;

                //var bi = d3.selectAll(".biplot");
                var temp_drag;
                var current_field;

                var dragHandler = d3.behavior.drag()
                    .on("dragstart", function (d) {

                        current_field = Dataset.schema.fieldSchema(d.brand);
                        var proIwant = d3.selectAll($("[id='" + d.brand + "']")).select('div')
                        //.attr ('class','schema-list-item ng-pristine ng-untouched ng-valid ui-droppable ui-droppable-disabled ng-empty ui-droppable-active drop-active');
                        var pill = {
                            field: current_field.field,
                            title: current_field.title,
                            type: current_field.type,
                            aggregate: current_field.aggregate
                        };
                        Pills.dragStart(pill, null);
                        // NotifyingService.notify();
                        var ori = proIwant.select('span').html();
                        //console.log(ori);
                        /* temp_drag = proIwant.select('span').select(function() {
                             return this.parentNode.insertBefore(this.cloneNode(true), this.nextSibling);
                         });*/
                        temp_drag = d3.select('bi-plot').append('span').html(ori);
                        temp_drag.attr("class", 'pill draggable cafull-width no-right-margin field-info ng-pristine ng-untouched ng-valid ng-isolate-scope ui-draggable ui-draggable-handle ng-empty ui-draggable-dragging')
                            .style("position", "absolute")
                            .style("z-index", '9999')
                            .style("left", function () {
                                return ((d3.event.x || d3.event.pageX)) + "px"
                            })
                            .style("top", function () {
                                var con = (d3.event.y || d3.event.pageY) + 100;
                                return con + "px"
                            });
                        d3.selectAll('.field-drop')
                            .attr("class", "field-drop ng-pristine ng-untouched ng-valid ui-droppable ng-not-empty ui-dropable-active drop-active ");
                        NotifyingService.notify();
                        // NotifyingService.notify();
                        //console.log($(proIwant[0]));
                        //$(proIwant[0]).trigger("mousedown");
                        //$(proIwant[0]).trigger('DOMContentLoaded');
                        //$(proIwant[0]).trigger('blur');
                    })
                    .on("drag", function (d) {
                        temp_drag
                            .style("left", function () {
                                return d3.event.x + "px"
                            })
                            .style("top", function () {
                                return (d3.event.y + 100) + "px"
                            });

                    })
                    .on("dragend", function (d) {
                        var proIwant = d3.selectAll("schema-list-item")
                            .data(Dataset.schema.fieldSchemas)
                            .filter(function (it) {
                                return it.field=== d.brand;
                            })
                            .select('div')
                            .attr('class', 'schema-list-item ng-pristine ng-untouched ng-valid ui-droppable ui-droppable-disabled ng-empty');
                        Pills.dragStop;

                        var pos = temp_drag.node().getBoundingClientRect();
                        temp_drag.remove();
                        var tem_group = d3.selectAll(".shelf-group");
                        tem_group = tem_group[0];
                        var tem_group = tem_group.filter(function (d, i) {
                            var pos_g = d.getBoundingClientRect();
                            return (pos_g.top < pos.top && pos_g.bottom > pos.top && pos_g.left < pos.left && pos_g.right > pos.left)
                        });

                        try {
                            var chan = $(tem_group[0]).attr('channel-id').replace(/'/g, "");
                            // console.log(chan);
                            if (chan != null) {
                                Pills.set(chan, current_field);
                                Pills.listener.dragDrop(chan);
                                //.update(Spec.spec);
                            }
                        } catch (e) {
                        }
                        NotifyingService.notify();
                        d3.selectAll("div [d3-over='true']")
                            .attr('d3-over', 'false');


                        //var event = new Event('submit');  // (*)
                        //$(d3.select('.schema')[0]).dispatchEvent(event);
                        d3.selectAll('.field-drop')
                            .attr("class", "field-drop ng-pristine ng-untouched ng-valid ui-droppable ng-not-empty");
                    });

                var listitem = g_axis.selectAll(".line")
                    .data(brands)
                    .attr('x1', function (d) {
                        return x(0)
                    })//x(-d.pc1);})
                    .attr('y1', function (d) {
                        return x(0)
                    })//y(-d.pc2); })
                    .attr("x2", function (d) {
                        return x(d.pc1);
                    })
                    .attr("y2", function (d) {
                        return y(d.pc2);
                    })
                    .style("stroke", function (d) {
                        return color(d['brand']);
                    })
                    .style("stroke-width", '1px')
                    .on('mouseover', onMouseOverBrand)
                    .on('mouseleave', onMouseLeave);
                if (dimension == 0) {
                    listitem
                        .on("dblclick", function (d) {
                            var proIwant = d3.selectAll($("[id='" + d.brand + "']"))
                                .select('div').select('span');
                            $(proIwant[0]).trigger("dblclick");
                        })
                        .call(dragHandler);
                } else {
                    listitem
                        .on("dblclick", function (d) {
                            // to do
                        })
                        .on("dragstart", null)
                        .on("drag", null)
                        .on("dragend", null);
                }
                listitem.exit().remove();
                listitem
                    .enter().append("line")
                    .attr("class", "line square draggable")
                    .attr('x1', function (d) {
                        return x(0)
                    })//x(-d.pc1);})
                    .attr('y1', function (d) {
                        return x(0)
                    })//y(-d.pc2); })
                    .attr("x2", function (d) {
                        return x(d.pc1);
                    })
                    .attr("y2", function (d) {
                        return y(d.pc2);
                    })
                    .style("stroke", function (d) {
                        return color(d['brand']);
                    })
                    .style("stroke-width", '1px')
                    .on('mouseover', onMouseOverBrand)
                    .on('mouseleave', onMouseLeave);
                if (dimension == 0) {
                    listitem.on("dblclick", function (d) {
                        var proIwant = d3.selectAll($("[id='" + d.brand + "']"))
                            .select('div').select('span');
                        $(proIwant[0]).trigger("dblclick");
                    })
                        .call(dragHandler);
                } else {
                    listitem
                        .on("dblclick", function (d) {
                            // to do
                        })
                        .on("dragstart", null)
                        .on("drag", null)
                        .on("dragend", null);
                }
                var tip = d3.tip()
                    .attr('class', 'd3-tip tips ')
                    .offset([10, 20])
                    .direction('e')
                    .html(function (values, title) {
                        var str = ''
                        str += '<h3>' + (title.length == 1 ? 'Brand ' : '') + title + '</h3>'
                        str += "<table>";
                        for (var i = 0; i < values.length; i++) {
                            if (values[i].key != 'pc1' && values[i].key != 'pc2') {
                                str += "<tr>";
                                str += "<td>" + values[i].key + "</td>";
                                var val = d3.format('.2f')(values[i].value);
                                val = isNaN(val)?values[i].value:val;
                                str += "<td class=pct>" + val + "</td>";
                                str + "</tr>";
                            }
                        }
                        str += "</table>";

                        return str;
                    });
                svg.call(tip);
                g_axis.selectAll('.place-label').remove();
                if (PCAplot.dim) {
                    var axis = g_axis.node();
                    axis.parentNode.appendChild(axis);

                    var arrangeLabels = function () {
                        var move = 1;
                        while (move > 0) {
                            move = 0;
                            g_axis.selectAll(".place-label")
                                .each(function () {
                                    var that = this,
                                        a = this.getBoundingClientRect();
                                    g_axis.selectAll(".place-label")
                                        .each(function () {
                                            if (this != that) {
                                                var b = this.getBoundingClientRect();
                                                if ((Math.abs(a.left - b.left) * 2 < (a.width + b.width)) &&
                                                    (Math.abs(a.top - b.top) * 2 < (a.height + b.height))) {
                                                    // overlap, move labels
                                                    var dx = (Math.max(0, a.right - b.left) +
                                                        Math.min(0, a.left - b.right)) * 0.01,
                                                        dy = (Math.max(0, a.bottom - b.top) +
                                                            Math.min(0, a.top - b.bottom)) * 0.02,
                                                        tt = d3.transform(d3.select(this).attr("transform")),
                                                        to = d3.transform(d3.select(that).attr("transform"));
                                                    move += Math.abs(dx) + Math.abs(dy);

                                                    to.translate = [to.translate[0] + dx, to.translate[1] + dy];
                                                    tt.translate = [tt.translate[0] - dx, tt.translate[1] - dy];
                                                    d3.select(this).attr("transform", "translate(" + tt.translate + ")");
                                                    d3.select(that).attr("transform", "translate(" + to.translate + ")");
                                                    a = this.getBoundingClientRect();
                                                }
                                            }
                                        });
                                });
                        }
                    }

                    var foci = [],
                        labels = [];

                    // Store the projected coordinates of the places for the foci and the labels
                    brands.forEach(function (d, i) {
                        var shifty = y(d.pc2);
                        shifty += (d.pc2 < 0) ? 15 : -5;
                        // foci.push({x: x(d.pc1), y: shifty});
                        labels.push({x: x(d.pc1), y: shifty, label: d.brand, anchor: (d.pc1 < 0 ? 'end' : 'start')});
                    });

                    var placeLabels = g_axis.selectAll('.place-label')
                        .data(labels)
                        .enter()
                        .append('text')
                        .attr('class', 'place-label')
                        .attr('text-anchor', function (d) {
                            return d.anchor
                        })
                        .attr('x', function (d) {
                            return d.x;
                        })
                        .attr('y', function (d) {
                            return d.y;
                        })
                        .text(function (d) {
                            return d.label.replace("Score", "");
                        })
                        .style("fill", function (d) {
                            return color(d.label);
                        })
                        .style("font-weight", "bold");

                    /*force.on("tick", function(e) {
                         var k = .1 * e.alpha;
                         labels.forEach(function(o, j) {
                             // The change in the position is proportional to the distance
                             // between the label and the corresponding place (foci)
                             o.y += (foci[j].y - o.y) * k;
                             o.x += (foci[j].x - o.x) * k;
                         });

                         // Update the position of the text element
                         g_axis.selectAll("text.place-label")
                             .attr("x", function(d) { return d.x; })
                             .attr("y", function(d) { return d.y; });
                     });

                     force.start();*/
                    arrangeLabels();
                }
                PCAplot.dataencde = data;
            }catch(e){console.log('Not enough dimension');}
            }
            return PCAplot};
        function getSpPoint(A,B,C){
            var x1=A.x, y1=A.y, x2=B.x, y2=B.y, x3=C.x, y3=C.y;
            var px = x2-x1, py = y2-y1, dAB = px*px + py*py;
            var u = ((x3 - x1) * px + (y3 - y1) * py) / dAB;
            var x = x1 + u * px, y = y1 + u * py;
            // var u = x3*scale_axis/dAB;
            var x = x1 + u * px, y = y1 + u * py;
            return {x:x, y:y}; //this is D
        }
        function rotate(x,y, dtheta) {

            var r = Math.sqrt(x*x + y*y);
            var theta = Math.atan(y/x);
            if (x<0) theta += Math.PI;

            return {
                x: r * Math.cos(theta + dtheta),
                y: r * Math.sin(theta + dtheta)
            }
        }
        function data2Num (input,keys){
            var clone = {};
            keys.forEach(key => clone[key] = [])
            var output=  Array.from(input);
            input.forEach(function (d){
                keys.forEach(key =>{
                    if (clone[key].find(function(it){return it.key == [d[key]];}) == undefined){
                        clone[key].push({'key': d[key]});
                    }
                })
            });


            for (var key in clone){
                clone[key].sort(function(a,b){
                    if (a.key < b.key)
                        return -1;
                    else
                        return 1;});


                clone[key].forEach(function(d,i){
                    if (d.key == null)
                        d.newindex = 0;
                    else if (isNaN(parseFloat(d.key) )){
                        d.newindex = i;
                    }else{
                        d.newindex = parseFloat(d.key);
                    }
                });
            }


// output with replaced number
            /*output.forEach(function (d,i){
                for ( var k in d){
                    output[i][k] = clone[k].find(function(it){return it.key == output[i][k]}).newindex;
                }
            });*/

            var matrix = input.map(function (d,i){
                return keys.map(function(k){
                    return clone[k].find(function(it){return it.key == output[i][k]}).newindex;
                });
            });
            return matrix;
            //return output.map(function(d){return Object.keys(d).map(function(i){return d[i]})});
        }

        PCAplot.estimate = function(PCAresult,dim,dataref) {
            // choose main axis
            if (dim===0) {
                // PCAplot.charts.length=0;
                // Dataset.schema.fieldSchemas.forEach(function (d) {
                //     var pca = PCAresult.find(function (it) {
                //         return (it['brand'] === d.field)
                //     });
                //     d.extrastat = {
                //         pc1: pca.pc1,
                //         pc2: pca.pc2,
                //         outlier: pca.outlier,
                //     };
                // });
                //
                // var recomen = [];
                // var pca1_max = PCAresult.sort(function (a, b) {
                //     return Math.abs(a.pc1) < Math.abs(b.pc1) ? 1 : -1
                // })[0]['brand'];
                // PCAresult.sort(function (a, b) {
                //     return Math.abs(a.pc2) < Math.abs(b.pc2) ? 1 : -1
                // });
                // var pca2_max = (PCAresult[0]['brand'] !== pca1_max) ? PCAresult[0]['brand'] : PCAresult[1]['brand'];
                // recomen.push(pca1_max);
                // recomen.push(pca2_max);
                // var object1 = Dataset.schema.fieldSchema(pca1_max);
                // var object2 = Dataset.schema.fieldSchema(pca2_max);
                PCAplot.charts.length=0;
                Dataset.schema.fieldSchemas.forEach(function (d) {
                    var pca = PCAresult.find(function (it) {
                        return (it['brand'] === d.field)
                    });
                    d.extrastat = {
                        pc1: (pca||{pc1:0}).pc1,
                        pc2: (pca||{pc2:0}).pc2,
                        outlier: (pca||{outlier:0}).outlier,
                    };
                });
                var recomen =[];
                var results ={};
                //variance
                Dataset.schema.fieldSchemas.sort(function (a, b) { return Math.abs(a.stats.variance) > Math.abs(b.stats.variance) ? -1 : 1});
                results.variance = Dataset.schema.fieldSchemas.find(function(d)  {
                    return (recomen.find(r=>r===d)=== undefined);
                });
                //multimodality
                Dataset.schema.fieldSchemas.sort(function (a, b) { return Math.abs(a.stats.multimodality) > Math.abs(b.stats.multimodality) ? -1 : 1});
                results.multimodality = Dataset.schema.fieldSchemas.find(function(d)  {
                    return (recomen.find(r=>r===d)=== undefined);
                });
                Dataset.schema.fieldSchemas.sort(function (a, b) { return Math.abs(a.stats.modeskew) > Math.abs(b.stats.modeskew) ? -1 : 1});
                results.skewness = Dataset.schema.fieldSchemas.find(function(d)  {
                    return (recomen.find(r=>r===d)=== undefined);
                });

                Dataset.schema.fieldSchemas.sort(function(a, b) {
                    return ((a.extrastat.outlier) <(b.extrastat.outlier)) ? 1 : -1});
                // console.log(Dataset.schema.fieldSchemas);
                results.outlier = Dataset.schema.fieldSchemas.find(function(d)  {
                    return (recomen.find(r=>r===d)=== undefined);
                });

                support[dim].types.forEach((d)=>drawGuideplot([results[d]], d));
                // drawGuideplot([variancemost], 'variance');
                // drawGuideplot([multimodalitymost], 'multimodality');
                // // drawGuideplot([object2], 'PC2');
                // drawGuideplot([mostskew], 'skewness');
                // drawGuideplot([mostoutlie], 'outlier');
            }
            else {
                PCAplot.charts.length=0;


                PCAplot.dataref = dataref.map(function(d){
                    return {fieldDefs: [Dataset.schema.fieldSchema(d.label[0]),Dataset.schema.fieldSchema(d.label[1])],
                        scag: d,};
                    });
                var objects = {};
                var tops = support[dim].types.filter((d,i)=>i<4).map(function(brand){
                    var type = brand;
                    var get = false;
                    dataref.sort(function (a,b){
                        return a[type]<b[type]?1:-1;
                    });
                    var obj = {};
                    dataref.find ((topp)=>{
                        var topitem = topp.label;
                        if (objects[topitem[0]] === undefined || objects[topitem[0]][topitem[1]]=== undefined){
                            objects[topitem[0]] = {}||objects[topitem[0]];
                            var newobs =  {
                                type: type,
                                fieldDefs:[Dataset.schema.fieldSchema(topitem[0]),Dataset.schema.fieldSchema(topitem[1])],};
                            objects[topitem[0]][topitem[1]] = newobs;
                            obj = {fields: newobs.fieldDefs,
                                type: type,
                                dataref: PCAplot.dataref,
                                score: dataref[0][type]};
                            return true;
                        }

                    });
                    return obj;
                });
                tops.sort(function(a,b){
                    return a.score<b.score?1:-1;
                });
                //console.log(tops.length>4?4:tops.length);
                ran =0;
                support[dim].types.filter((d,i)=>i<4).forEach((d)=>{
                    var  item = tops.find(t=>t.type==d);
                    if(item)
                        drawGuideplot(item.fields,item.type,PCAplot.dataref)});

            }
        };
        function mark2plot (mark,spec,object){
            switch (mark) {
                case 'bar': barplot(spec, object); break;
                case 'tick': dashplot(spec, object); break;
                case 'area': areaplot(spec, object); break;
                case 'boxplot': boxplot(spec, object); break;
                case 'point': pointplot(spec, object); break; // 2D
                case 'hexagon': pointplot(spec, object,'hexagon'); break;
                case 'leader': pointplot(spec, object,'leader'); break;
                case 'contour': pointplot(spec, object,'contour'); break;
                case 'scatter3D': scatterplot(spec,object); break;
                case 'scatter3D-point': scatterplot(spec,object,'point'); break;
                case 'scatter3D-evenbin': scatterplot(spec,object,'evenbin'); break;
                case 'scatter3D-contour': scatterplot(spec,object,'contour'); break;
                case 'radar': radarplot(spec,object); break;
                case 'radar-evenbin': radarplot(spec,object,'evenbin'); break;
                case 'radar-leader': radarplot(spec,object,'leader'); break;
                case 'radar-contour': radarplot(spec,object,'contour'); break;
            }
        }

        var guideon = function(prop,mspec){
            if (this) {
                var tolog = {level_explore: prop.dim, abtraction: prop.mark, visual_feature: prop.type};
                Logger.logInteraction(Logger.actions.GUIDEPLOT_SELECT, this.shorthand,{
                    val: {PS: tolog, spec: this.vlSpec, query: this.query},
                    time: new Date().getTime()
                });
            }
            //console.log(prop);
            //prop.charts = Dataset.schema.fieldSchemas.sort(prop.ranking)
            PCAplot.types =  support[prop.dim].types;
            PCAplot.marks = support[prop.dim].marks.map((m,i)=> {return {label:abtractionLevel[i], mark: m}});
            var axis = prop.fieldDefs.map(function(d){return d.field});
            // PCAplot.spec = mspec;
            prop.charts = (prop.dim>1?[prop.fieldDefs]:(getData(prop.dim).sort(prop.ranking)))
            .map(function(d){
                var chart = prop.plot((d.fieldDefs||d ),prop.mark,prop.mspec);
                chart.vlSpec.config.typer = {type: prop.type,val: (prop.dim>1?0:getTypeVal(undefined,d.fieldDefs||d))};
                return chart;});

            prop.previewcharts = prop.charts.map(function (d,i) {
                var thum =_.cloneDeep(d);
                // console.log(d);
                var typer = {};
                typer[prop.type] = d.vlSpec.config.typer.val[prop.type];
                thum.vlSpec.config = {
                    cell: {
                        width: prop.dim?100:200,
                        height: prop.dim?100:30
                    },
                    axis: {
                        grid: false,
                        //ticks: false,
                        labels: false,
                        titleOffset: 20
                    },
                    overlay: {line: true},
                    scale: {useRawDomain: true},
                    displayModeBar: false,
                    colorbar: false,
                    typer: {type: prop.type,val: typer},
                };
                if (d.fieldSet[0].type!=="temporal"){
                    thum.vlSpec.config.axis.ticks = false;
                }
                thum.order = i;
                return thum;});
            var pos = 0;
            pos = findinList(axis,prop.charts);
            //}
            PCAplot.prop.mspec = prop.charts[pos];
            prop.pos = pos;
            PCAplot.updateguide(prop);
        };
        var getData = function (dim) {
            if (dim<2)
                return PCAplot.data[dim>1?1:dim];
            else{
                var dataout = combinations(PCAplot.data[0],0,0,dim,[],[]);
                return dataout;
            }
        };
        function combinations(choices,start,curentn, dim,data,prefix) {
            for (var  i = start;i<choices.length;i++){
                var current_comb = (prefix || []).concat(choices[i]);
                if (curentn===dim) {
                    data.push(current_comb);

                }
                else
                    combinations(choices,start+1,curentn+1, dim,data, current_comb);
            }
            return data;
        }

        function drawGuideplot (object,type,dataref) {
            if (dataref === undefined)
                dataref = Dataset.schema.fieldSchemas;
            var spec = spec = _.cloneDeep(instantiate() || PCAplot.spec);
            //spec.data = Dataset.dataset;
            spec.type = type;
            spec.config = {
                cell: {
                    width: PCAplot.dim?100:200,
                    height: PCAplot.dim?100:30,
                },
                axis: {
                    grid: false,
                    ticks: 0,
                    titleOffset: 20
                },
                overlay: {line: true},
                scale: {useRawDomain: true}
            };
            spec.config.typer = {type: type,val: getTypeVal(type,object)};
            mark2plot (type2mark(type,PCAplot.dim),spec,object);
            var query = getQuery(spec,undefined,type);
            var output = cql.query(query, Dataset.schema);
            PCAplot.query = output.query;
            var topItem = output.result.getTopSpecQueryModel();
            PCAplot.chart = Chart.getChart(topItem);
            PCAplot.chart.vlSpec.config.displayModeBar = false;
            PCAplot.chart.vlSpec.config.colorbar = false;
            PCAplot.chart.vlSpec.config.staticPlot= true;
            PCAplot.chart.query={
                groupBy: 'encoding',
                orderBy: ['feature'],
                chooseBy: ['abstraction']
                //chooseBy: ['aggregationQuality', 'effectiveness'],
                };
            PCAplot.chart.prop = {
                mspec:_.cloneDeep(PCAplot.chart),
                type: type,
                mark: spec.mark,
                ranking: getranking(type),
                plot: drawGuideexplore,
                dim: PCAplot.dim,
                fieldDefs: object,};
            PCAplot.chart.guideon = guideon;
                PCAplot.charts.push(PCAplot.chart);
        }
        PCAplot.prop2spec = function (prop) {
            PCAplot.state = states.GENERATE_GUIDE;
            PCAplot.prop = prop;
            Pills.select(prop.mspec.vlSpec);
            // angular.element('.markselect').scope().spec = prop.mspec;
        };
        PCAplot.madeprop = function (spec){
            var type = PCAplot.prop.type;
            var dim = PCAplot.prop.dim;
            var mark = PCAplot.prop.mark;
            var prop = {
                mspec: spec,
                type: type,
                mark: mark,
                ranking: getranking(type),
                plot: drawGuideexplore,
                fieldDefs: PCAplot.prop.fieldDefs,
                dim: dim};
            switch (PCAplot.state){
                case states.GENERATE_GUIDE:
                    PCAplot.limitup = Infinity;
                    guideon(prop);
                    var tolog = {level_explore: prop.dim, type: prop.mark,abstraction: prop.mark, visual_feature: prop.type};
                    Logger.logInteraction(Logger.actions.EXPANDED_SELECT,this.shorthand,{val:{PS:tolog,spec:this.vlSpec,query:this.query}, time:new Date().getTime()});
                    PCAplot.limit = limitDefault;
                case states.GENERATE_ALTERNATIVE:
                    PCAplot.alternativeupdate();
                    PCAplot.state = states.FREE;
                    break;
                default: return;
            }
            //PCAplot.updateguide(prop);
            //PCAplot.alternativeupdate();
        };
        function spec2typer(spec,fields){
            var typer ={};
            if (spec.type){
            var extra = spec.config.extraconfig;
            typer.mark = extra? spec.mark+"-"+extra:spec.mark;
            typer.dim = PCAplot.dim;
            typer.type = spec.type;
            typer.fieldDefs = fields.map(function(f) {return Dataset.schema.fieldSchema(f)});
            }else {
                typer.mark = PCAplot.prop.mark;
                typer.dim = PCAplot.prop.dim;
                typer.type = PCAplot.prop.type;
                typer.fieldDefs = fields.map(function(f) {return Dataset.schema.fieldSchema(f)});
            }
            return typer;
        }
        function wrongMarkDim(mark,dim){
            return support[dim].marks.find(function(m){return m===mark})===undefined;
        }
        PCAplot.checkRender = function (spec,fields) { // convert spec to mpec
            console.log(spec)
            var typer = spec2typer(spec,fields);
            var type = type2type(typer.type,typer.dim,PCAplot.dim);
            console.log(typer);
            console.log(type);
            if (PCAplot.prop!= null ) {
                if ((spec.mark !== PCAplot.prop.mark) ||(PCAplot.dim !== PCAplot.prop.dim))
                {
                    PCAplot.state = states.GENERATE_GUIDE;
                    if ((PCAplot.dim !== PCAplot.prop.dim)||(typer.mark==='__ANY__')){
                        if (wrongMarkDim(typer.mark,PCAplot.dim)) {
                            spec.mark = type2mark(type, PCAplot.dim);
                            PCAplot.prop.mark = spec.mark;
                        }else {
                            PCAplot.prop.mark = typer.mark;
                        }
                        PCAplot.prop.dim = PCAplot.dim;
                        PCAplot.prop.type = type;
                        spec.type = type;
                    }
                    PCAplot.prop.fieldDefs = typer.fieldDefs;
                } else if(PCAplot.state === states.FREE){
                    var pos = findinList(fields);
                    console.log('position find:'+pos);
                    if (PCAplot.prop.pos !== pos){
                        if (pos!==-1) {
                            PCAplot.prop.pos = pos;
                            if (pos > PCAplot.limit) {
                                PCAplot.limitup = pos - 2;
                                PCAplot.limit = limitDefault;
                            }

                            PCAplot.prop.mspec = PCAplot.prop.charts[PCAplot.prop.pos];
                        }else{
                            PCAplot.state = states.GENERATE_GUIDE;
                            PCAplot.prop.fieldDefs = typer.fieldDefs;
                            return;
                        }
                    }
                        PCAplot.state = states.GENERATE_ALTERNATIVE;
                    PCAplot.prop.fieldDefs = typer.fieldDefs;
                }
            }else if (fields.length){
                PCAplot.state = states.GENERATE_GUIDE;
                spec.mark = type2mark(type,PCAplot.dim);
                spec.type = type;
                PCAplot.prop = {};
                PCAplot.prop.mark = spec.mark;
                PCAplot.prop.type = type;
                PCAplot.prop.fieldDefs = typer.fieldDefs;
                PCAplot.prop.dim = PCAplot.dim;
            }
            return spec;
        };
        function mar2Obbject(dim,mark) {
            var markIndex = support[dim].marks.indexOf(mark);
            return {label:abtractionLevel[markIndex],mark:mark};
        }
        function findinList(fields,charts) {
            return (charts||PCAplot.prop.charts).findIndex(function(d){
                var countcheck = 0;
                d.fieldSet.forEach(function(fi){
                    fields.forEach(function(f){
                        countcheck += (fi.field === f);
                    });
                });
                return (countcheck > fields.length)||(countcheck === fields.length);
            });
        }
        PCAplot.alternativeupdate = function(mspec){

            mspec = _.cloneDeep(mspec || PCAplot.prop.mspec);
            if (PCAplot.dataref.length ===0|| PCAplot.dataref== null){
                var data = [];
                var datarefn = [];
                var idlabel=[];
                data = PCAplot.data[0].map(function(d){
                    var tem = {field: d.field};
                    tem[d.field] = d.scag;
                    return tem;});
                var newdata=[];
                data.forEach(function(d){
                    for (var e in d[d.field]) {
                        //if (d[d.field][e].invalid!=1){ FIXME
                            idlabel.push([d.field,e]);
                            newdata.push(d[d.field][e]);//}
                    }
                });
                data = newdata;//.filter(function(d){return !d.invalid});
                data.forEach(function(d,i){d.label = idlabel[i]});
                datarefn = _.cloneDeep(data);
                PCAplot.dataref = datarefn.map(function(d){
                    return {fieldDefs: [Dataset.schema.fieldSchema(d.label[0]),Dataset.schema.fieldSchema(d.label[1])],
                        scag: d,};
                });
                PCAplot.data[1] =PCAplot.dataref;
            }
            //var fieldsets = mspec.fieldSet.map(function(d){return d.field}).filter(function(d){return d!="count"&&d!="*"});
            var fieldsets = mspec.fieldSet.map(function(d){return d.field}).filter(function(d){return d!="count"&&d!="*"});
            if(fieldsets.length>2){
                PCAplot.alternatives = [{'charts': []}];
                return;
            }
            if (fieldsets.length===0) {
                PCAplot.alternatives.length = 0;
                return;
            }
            if (fieldsets.length<2) {
                var possible = getData(1).filter(function (d) {
                    var ff = true;
                    fieldsets.forEach(function (it) {
                        var f = false;
                        d.fieldDefs.forEach(function (m) {
                            f = (f || (m.field=== it));
                        });
                        ff = ff && f;
                    });
                    return ff;
                });
                if (possible.length !== 0) {
                    var topitem = support[PCAplot.dim + 1].types.map(function (d) {
                        return possible.sort(function (a, b) {
                            return (a.scag[d] < b.scag[d]) ? 1 : -1;
                        })[0];
                    });
                    topitem.filter(d=>d.invalid != true);
                    var unique = [];
                    var uniquetype = [];
                    topitem.forEach(function (d, i) {
                        if (unique.filter(function (u) {
                                return u === d;
                            }).length === 0) {
                            unique.push(d);
                            uniquetype.push(support[PCAplot.dim + 1].types[i]);
                        }
                    });
                    var charts = uniquetype.map(function (d, i) {
                        return {v: unique[i], type: d}
                    })
                        .map(function (d) {
                            var spec = {};
                            //spec.data = Dataset.dataset;
                            spec.type = d.type;
                            spec.config = {
                                /*cell: {
                                    width: PCAplot.dim?100:200,
                                    height: PCAplot.dim?100:30,
                                },*/
                                axis: {
                                    grid: false,
                                },
                                overlay: {line: true},
                                scale: {useRawDomain: true}
                            };
                            mark2plot(mark2mark(mspec.vlSpec.mark, PCAplot.dim), spec, d.v.fieldDefs);
                            var query = getQuery(spec,undefined,d.type);
                            var output = cql.query(query, Dataset.schema);
                            PCAplot.query = output.query;
                            var topItem = output.result.getTopSpecQueryModel();
                            var temc = Chart.getChart(topItem);
                            // temc.vlSpec.config.typer = {type: d.type,mark: mark2mark(mspec.vlSpec.mark, PCAplot.dim)
                            //     ,dim: d.v.fieldDefs.length-1, fieldDefs:d.v.fieldDefs};
                            temc.query={
                                groupBy: 'encoding',
                                orderBy: ['feature'],
                                chooseBy: ['abstraction'],
                                //chooseBy: ['aggregationQuality', 'effectiveness'],
                            };
                            return temc;

                        });
                    PCAplot.alternatives = [{'charts': charts}];
                }
                else {
                    PCAplot.alternatives.length = 0;
                }
            }
            else {
            var possible = getData(fieldsets.length-1).filter(function (d){
                var ff= false;
                fieldsets.forEach(function(it){
                    var f=false;
                    d.fieldDefs.forEach(function(m){f=(f||(m.field===it)); });
                    ff=ff||f;});
                return ff;});

            possible = possible.filter(function (d){
                var ff= true;
                fieldsets.forEach(function(it){
                    var f=false;
                    d.fieldDefs.forEach(function(m){f=(f||(m.field===it)); });
                    ff=ff&&f;});
                return !ff;});
            var topitem = support[1].types.map(function (d) {
                return possible.sort(function (a, b) {
                    return (a.scag[d] < b.scag[d]) ? 1 : -1;
                })[0];
            });
            // FIX ME lack of relationship mapping here
            var unique = [];
            var uniquetype = [];
            topitem.forEach(function (d, i) {
                if (unique.filter(function (u) {
                        return u.fieldDefs === d.fieldDefs;
                    }).length === 0) {
                    unique.push(JSON.parse(JSON.stringify(d)));
                    var currentsupport = support.getsupport(fieldsets.length-1);
                    var maxsupport = currentsupport.types.length;
                    uniquetype.push(currentsupport.types[i>maxsupport?(maxsupport-1):i]);
                }
            });
            unique.forEach(function(d,i){
                var label='';
                var newf = fieldsets.map(function(f){
                    label=label+'-'+f;
                    return Dataset.schema.fieldSchema(f);});

                Array.prototype.push.apply(newf,d.fieldDefs.filter(function(fe){
                    var ff = true;
                    fieldsets.forEach(function(fs){ff=ff&&(fs!==fe.field)});
                    if (ff) label=label+'-'+fe.field;
                    return ff;})
                );
                d.label = label;
                d.type = uniquetype[i];
            d.fieldDefs=newf});
                unique  = _.uniqBy(unique,'label');

            var charts = unique.map(function (d, i) {
                return {v: d, type: d.type}
            })
                .map(function (d) {
                    var spec = {};
                    spec.type = d.type;
                    spec.config = {

                        axis: {
                            grid: false,
                            ticks: false,
                            titleOffset: 20
                        },
                        overlay: {line: true},
                        scale: {useRawDomain: true}
                    };
                    mark2plot(mark2mark(mspec.vlSpec.mark, PCAplot.dim), spec, d.v.fieldDefs);
                    var query = getQuery(spec,undefined,d.type);
                    var output = cql.query(query, Dataset.schema);
                    PCAplot.query = output.query;
                    var topItem = output.result.getTopSpecQueryModel();
                    var charttemp = Chart.getChart(topItem);
                    charttemp.query={
                        groupBy: 'encoding',
                        orderBy: ['feature'],
                        chooseBy: ['abstraction'],
                        //chooseBy: ['aggregationQuality', 'effectiveness'],
                    };
                    return charttemp;

                });
            PCAplot.alternatives = [{'charts': charts}];
            }

        };

        PCAplot.updateSpec = function(prop){
            //PCAplot.
            PCAplot.types =  support[prop.dim].types;
            PCAplot.marks = support[prop.dim].marks.map((m,i)=> {return {label:abtractionLevel[i], mark: m}});
            var nprop = _.cloneDeep(prop);
            nprop.ranking = getranking(prop.type);
            mark2plot (prop.mark,nprop.mspec,Dataset.schema.fieldSchemas.slice(0,prop.dim+1));
            nprop.charts.length = 0;

            var dataref = prop.dim>1?[prop.fieldDefs]:getData(nprop.dim);//?PCAplot.dataref:Dataset.schema.fieldSchemas;
            nprop.charts = dataref.sort(nprop.ranking)
                .map(function(d) {
                    var chart = drawGuideexplore((d.fieldDefs||d),nprop.mark,nprop.mspec);
                    chart.vlSpec.config.typer = {type: prop.type,val: getTypeVal(undefined,d.fieldDefs||d)};
                    return chart; });
            //while (nprop[nprop.length-1])
            nprop.previewcharts = nprop.charts.map(function(d,i) {
                var thum =_.cloneDeep(d);
                var typer = {};
                typer[prop.type] = d.vlSpec.config.typer.val[prop.type];
                thum.vlSpec.config = {
                    cell: {
                        width: 100,
                        height: nprop.dim?100:30
                    },
                    axis: {
                        grid: false,
                        // ticks: false,
                        labels: false,
                        titleOffset: 20
                    },
                    overlay: {line: true},
                    scale: {useRawDomain: true},
                    displayModeBar: false,
                    colorbar: false,
                    typer: {type: prop.type,val: typer},
                };
                thum.query={
                    groupBy: 'encoding',
                    orderBy: ['feature'],
                    chooseBy: ['abstraction'],
                    //chooseBy: ['aggregationQuality', 'effectiveness'],
                };
                if (d.fieldSet[0].type!=="temporal"){
                    thum.vlSpec.config.axis.ticks = false;
                }
                thum.order = i;
                return thum;});
            var fields = nprop.fieldDefs.map(function(f){return f.field});
            nprop.pos = findinList(fields,nprop.charts);
            nprop.mspec = nprop.charts[nprop.pos];
            // PCAplot.state = states.GENERATE_ALTERNATIVE;
            PCAplot.updateguide(nprop);
            Pills.select(nprop.mspec.vlSpec);
            // PCAplot.madeprop(PCAplot.prop.charts[nprop.pos]);
        };
        var ran = 0;
        function mark2mark(oldmark,dim,newdim){
            newdim = (newdim===undefined)?dim+1:newdim;
            var pos = 0;
            support[dim].marks.forEach(function(d,i){
                if (d==oldmark){
                    pos= i; return ;}});
            return support[dim+1].marks[pos>support[newdim].marks.length-1?0:pos];
        }
        function type2type(oldtype,olddim,newdim){
            if (oldtype===undefined){
                return support[newdim].types[0];
            }else {
                var pos = 0;
                support[olddim].types.forEach(function (d, i) {
                    if (d === (oldtype)) {
                        pos = i;
                        return;
                    }
                });
                return support[newdim].types[pos > support[newdim].types.length - 1 ? 0 : pos];
            }
        }
        function getmark (type,option,pos){
            switch(option||this.option){
                case 'random':
                    var oldran = ran;
                    ran = ran>2?0:(ran+1);
                    return this.marks[oldran];
                case 'manual':
                    return this.marks[pos];
                default:
                    var pos = this.types.findIndex(function(d){return d=== type});
                    return this.marks[pos>this.marks.length-1?0:pos];
            }
        }
        function type2mark (type,dim){
            return support[dim].getmark(type,null);
        }

        function getranking(type){
            switch (type) {
                case 'PC1': return function (a,b){return Math.abs(a.extrastat.pc1) < Math.abs(b.extrastat.pc1) ? 1:-1};
                    break;
                case 'variance': return function (a,b){return Math.abs(a.stats.variance) < Math.abs(b.stats.variance) ? 1:-1};
                    break;
                case 'multimodality': return function (a,b){return Math.abs(a.stats.multimodality) < Math.abs(b.stats.multimodality) ? 1:-1};
                    break;
                case'skewness': return function (a,b){return Math.abs(a.stats.modeskew) < Math.abs(b.stats.modeskew) ? 1:-1};
                    break;
                case'PC2': return function (a,b){return Math.abs(a.extrastat.pc2) < Math.abs(b.extrastat.pc2) ? 1:-1};
                    break;
                case'outlier': return function (a,b){return a.extrastat.outlier < b.extrastat.outlier? 1:-1};
                    break;
                default: return function (a,b){
                    if (a.scag!==undefined)
                        return (a.scag[type] < b.scag[type]) ? 1:-1;
                    else
                        0;
                };
                    break;
            }
        }
        function getTypeVal(type,objects,skipFindField){
            var a;
            if (!skipFindField) {
                if (objects.length===undefined)
                    objects = [objects];
                var dim = objects.length - 1;
                a = getData(dim).find(function (d) {
                    var temp = (d.fieldDefs || [d]);
                    var count = temp.length;

                    (d.fieldDefs || [d]).forEach(function (f) {
                            count = count - !(objects.find(function (o) {
                            return o.field === f.field
                        }) === undefined);
                    });
                    return !count;
                });
            }else{
                a= objects;
            }

            switch (type) {
                case 'PC1': return {'PC1': (a||objects).extrastat.pc1};
                case 'variance': return {'variance': (a||objects).stats.variance};
                case 'multimodality': return {'multimodality': (a||objects).stats.multimodality};
                case 'skewness': return {'skewness':(a||objects).stats.modeskew};
                case 'PC2': return {'PC2':(a||objects).extrastat.pc2};
                case 'outlier': return {'outlier':(a||objects).extrastat.outlier};
                case undefined:
                    var typeval ={};
                    support.getsupport(dim).types.forEach(function(d){
                        typeval[d] = getTypeVal(d,a,true)[d];
                    });
                    return typeval;
                default:
                    var typeval ={};
                    typeval[type] = (a===undefined)?0:a.scag[type];
                    return typeval;
            }
        }
        var drawGuideexplore = function (object,type,mspec) {
            var spec = _.cloneDeep(mspec);
            //spec.data = Dataset.dataset;
            spec.config = {
                overlay: {line: true},
                scale: {useRawDomain: true}
            };

            mark2plot(type,spec,object);

            var query = getQuery(spec,undefined,type);
            var output = cql.query(query, Dataset.schema);
            var topItem = output.result.getTopSpecQueryModel();
            var charttemp = Chart.getChart(topItem);
            charttemp.query={
                groupBy: 'encoding',
                orderBy: ['feature'],
                chooseBy: ['abstraction'],
                //chooseBy: ['aggregationQuality', 'effectiveness'],
            };
            return charttemp;
        };
        // PCAplot.alternatives = Alternatives.getHistograms(null, PCAplot.chart, null);

        function barplot(spec,objectin) {
            var object = objectin[0]||objectin;
            spec.mark = "bar";
            spec.encoding = {
                x: {field: object.field, type: object.type},
                y: {aggregate: "count", field: "*"}
            };
            if (object.type==="quantitative"){
                spec.encoding.x.bin ={};
                spec.encoding.y.type = object.type;
            }else if(object.primitiveType ==="string"){
                spec.encoding.y.type = "quantitative";
            }else if (object.type==="temporal"){
                spec.encoding.x.bin ={};
                //spec.encoding.x.type = "ordinal";
                spec.encoding.x.timeUnit = "year";
                spec.encoding.y.type = "quantitative";
            }

        }

        function dashplot(spec,objectin) {
            var object = objectin[0]||objectin;
            spec.mark = "tick";
            spec.encoding = {
                x: {field: object.field, type: object.type}
            };
        }

        function areaplot(spec,objectin) {
            var object = objectin[0]||objectin;
            spec.mark = "area";
            spec.encoding = {
                x: {field: object.field, type: object.type},
                y: {aggregate: "count", field: "*"}
            };
            if (object.type==="quantitative"){
                spec.encoding.x.bin ={};
                spec.encoding.y.type = object.type;
            }else if(object.primitiveType ==="string"||object.type==="temporal"||object.primitiveType ==="integer"){
                spec.encoding.y.type = "quantitative";
            }
            spec.config.opacity = 1;
        }
        function boxplot(spec,objectin) {
            var object = objectin[0]||objectin;
            spec.mark = "boxplot";
            spec.encoding = {
                x: { field: object.field, type: object.type}
            };
        }

        function pointplot(spec,objects,extramark) {
            spec.mark = extramark||"point";
            spec.encoding = {
                x: { field: objects[0].field, type: objects[0].type},
                y: { field: objects[1].field, type: objects[1].type},
            };
            spec.config = spec.config||{};
            spec.config.mark= {"filled": true, "opacity":1};
        }

        function scatterplot(spec,objects,option){
            spec.mark = "scatter3D";
            spec.encoding = {
                x: { field: objects[0].field, type: objects[0].type},
                y: { field: objects[1].field, type: objects[1].type},
                column: { field: objects[2].field, type: objects[2].type},
            };
            if (option)
                spec.config.extraconfig = option;
        }
        function radarplot(spec,objects,option){
            spec.mark = "radar";
            spec.encoding = {
                x: { field: objects[0].field, type: objects[0].type},
                y: { field: objects[1].field, type: objects[1].type},
                column: { field: objects[2].field, type: objects[2].type},
                row: { field: objects[3].field, type: objects[3].type},
            };
            if (option)
                spec.config.extraconfig = option;
            //spec.layer = objects.map(function(o){return {encoding:{x: { field: o.field, type: o.type}}}});
        }


        function getQuery(spec, convertFilter,type /*HACK */) {
            var specQuery = getSpecQuery(spec, convertFilter);

            var hasAnyField = false, hasAnyFn = false, hasAnyChannel = false;

            for (var i = 0; i < specQuery.encodings.length; i++) {
                var encQ = specQuery.encodings[i];
                if (encQ.autoCount === false) continue;

                if (cql.enumSpec.isEnumSpec(encQ.field)) {
                    hasAnyField = true;
                }

                if (cql.enumSpec.isEnumSpec(encQ.aggregate) ||
                    cql.enumSpec.isEnumSpec(encQ.bin) ||
                    cql.enumSpec.isEnumSpec(encQ.timeUnit)) {
                    hasAnyFn = true;
                }

                if (cql.enumSpec.isEnumSpec(encQ.channel)) {
                    hasAnyChannel = true;
                }
            }

            /* jshint ignore:start */
            var groupBy = spec.groupBy;

            if (spec.groupBy === 'auto') {
                groupBy = PCAplot.autoGroupBy = hasAnyField ?
                    (hasAnyFn ? 'fieldTransform' : 'field') :
                    'encoding';
            }

            return {
                spec: specQuery,
                groupBy: groupBy,
                orderBy: [type],
                chooseBy: ['aggregationQuality', 'effectiveness'],
                config: {
                    omitTableWithOcclusion: false,
                    autoAddCount: (hasAnyField || hasAnyFn || hasAnyChannel) && spec.autoAddCount
                }
            };
            /* jshint ignore:end */
        }

        function getSpecQuery(spec, convertFilter /*HACK*/) {
            if (convertFilter) {
                spec = util.duplicate(spec);


                // HACK convert filter manager to proper filter spec
                if (spec.transform && spec.transform.filter) {
                    delete spec.transform.filter;
                }

                var filter = FilterManager.getVlFilter();
                if (filter) {
                    spec.transform = spec.transform || {};
                    spec.transform.filter = filter;
                }
            }

            return {
                data: Config.data,
                mark: spec.mark === ANY ? '?' : spec.mark,
                type: spec.type,
                // TODO: support transform enumeration
                transform: spec.transform,
                encodings: vg.util.keys(spec.encoding).reduce(function(encodings, channelId) {
                    var encQ = vg.util.extend(
                        // Add channel
                        { channel: Pills.isAnyChannel(channelId) ? '?' : channelId },
                        // Field Def
                        spec.encoding[channelId],
                        // Remove Title
                        {title: undefined}
                    );

                    if (cql.enumSpec.isEnumSpec(encQ.field)) {
                        // replace the name so we should it's the field from this channelId
                        encQ.field = {
                            name: 'f' + channelId,
                            enum: encQ.field.enum
                        };
                    }

                    encodings.push(encQ);
                    return encodings;
                }, []),
                config: spec.config
            };
        }
        PCAplot.parseSpec = function(newSpec) {
            // TODO: revise this
            PCAplot.spec = parse(newSpec);
        };
        function parse(spec) {
            var oldSpec = util.duplicate(spec);
            var oldFilter = null;

            if (oldSpec) {
                // Store oldFilter, copy oldSpec that exclude transform.filter
                oldFilter = (oldSpec.transform || {}).filter;
                var transform = _.omit(oldSpec.transform || {}, 'filter');
                oldSpec = _.omit(oldSpec, 'transform');
                if (transform) {
                    oldSpec.transform = transform;
                }
            }

            var newSpec = vl.util.mergeDeep(instantiate(), oldSpec);

            // This is not Vega-Lite filter object, but rather our FilterModel
            newSpec.transform.filter = FilterManager.reset(oldFilter);

            return newSpec;
        }

        PCAplot.updateguide= function(prop) {
            //var oldtyper = prop.mspec.config.typer;
            prop = _.cloneDeep(prop || PCAplot.prop);
            prop.mspec.config={};
            // prop.mspec.config.typer = oldtyper||PCAplot.prop.mspec.config.typer;
            // delete prop.mspec.model;
            PCAplot.prop = prop;
            PCAplot.limitup = (PCAplot.prop.pos > (PCAplot.limit-1))? (PCAplot.prop.pos-2) : 0;
            PCAplot.mspec = prop.mspec;
        };
        // const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
        // Array.prototype.naturalSort= function(_){
        //     if (arguments.length) {
        //         return this.sort(function (as, bs) {
        //             return collator.compare(as[_],bs[_]);
        //         });
        //     }else {
        //         return this.sort(collator.compare);
        //     }
        // };
        function combineName (flieds){
            return flieds.map(d=>d.replace(/-/g,'')).naturalSort().join('-');
        }

        /**
         *
         * @param primfield
         * @param dataschema
         * @param data
         * @param maxCombine
         */
        function calscagnotic (primfield,dataschema,data,maxCombine){
            importScripts("https://cdnjs.cloudflare.com/ajax/libs/require.js/2.1.20/require.min.js");
            const collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
            Array.prototype.naturalSort= function(_){
                if (arguments.length) {
                    return this.sort(function (as, bs) {
                        return collator.compare(as[_],bs[_]);
                    });
                }else {
                    return this.sort(collator.compare);
                }
            };
            function stackforScag(queue,fields, matrix){
                if (fields.length === maxCombine) {
                    const nameTag = combineName(fields);
                    if (dataschema.scag[maxCombine-1][nameTag]) {
                        const scag = scagnoticscoreAll(matrix);
                        notify({source: nameTag, value: scag});
                        return true;
                    }
                        return false;
                }
                else {
                    const field = queue.pop();
                    stackforScag(newfield,fields, matrix)
                }
            }

            require(['https://idatavisualizationlab.github.io/N/Scagnostic/scagnostics.min.js'], function() {
                primfield.forEach(function (selectedfield) {
                    dataschema._fieldSchemas.forEach(function (d) {
                        if ((d.field !== selectedfield) && (dataschema._fieldSchemaIndex[selectedfield].scag == undefined || dataschema._fieldSchemaIndex[selectedfield].scag[d.field] === undefined) && (d.scag === undefined || (d.scag[selectedfield] === undefined))) {
                                var scag = scagnoticscore([selectedfield, d.field],checkValid(dataschema._fieldSchemaIndex[selectedfield]) && checkValid(dataschema._fieldSchemaIndex[d.field]));
                            if (dataschema._fieldSchemaIndex[selectedfield].scag === undefined)
                                dataschema._fieldSchemaIndex[selectedfield].scag = {};
                            dataschema._fieldSchemaIndex[selectedfield] .scag[d.field] = scag;
                            notify({source: selectedfield, target: d.field, value: scag});
                        }
                    })
                });
                return complete(dataschema);
                // stackforScag(primfield,[], []);
            });

            function checkValid(field) {
                return (field.type !== 'temporal')&&(field.primitiveType!=="string");
            }
            function combineName (fields){
                return fields.map(d=>d.replace(/-/g,'')).naturalSort().join('-');
            }
            function scagnoticscore (fields,valid){
                if (valid) {
                    var matrix = [];
                    data.forEach(function (d) {
                        if (d[fields[0]] !== undefined && d[fields[1]] !== undefined)
                        matrix.push( fields.map(f => d[f]))
                    });

                    try {
                        var scag = this.scagnostics(matrix, {
                            // isBinned: false,
                            binType: 'leader',
                            startBinGridSize: 40
                        });
                        if (!isNaN(scag.skinnyScore))
                            return {
                                'outlying': scag.outlyingScore,
                                'skewed': scag.skewedScore,
                                'sparse': scag.sparseScore,
                                'clumpy': scag.clumpyScore,
                                'striated': scag.striatedScore,
                                'convex': scag.convexScore,
                                'skinny': scag.skinnyScore,
                                'stringy': scag.stringyScore,
                                'monotonic': scag.monotonicScore
                            };
                        else return {
                            'outlying': 0,
                            'skewed': 0,
                            'sparse': 0,
                            'clumpy': 0,
                            'striated': 0,
                            'convex': 0,
                            'skinny': 0,
                            'stringy': 0,
                            'monotonic': 0,
                            invalid: 1
                        };

                    } catch (e) {
                        return {
                            'outlying': 0,
                            'skewed': 0,
                            'sparse': 0,
                            'clumpy': 0,
                            'striated': 0,
                            'convex': 0,
                            'skinny': 0,
                            'stringy': 0,
                            'monotonic': 0,
                            invalid: 1,
                        };
                    }
                } else {
                    return {
                        'outlying': 0,
                        'skewed': 0,
                        'sparse': 0,
                        'clumpy': 0,
                        'striated': 0,
                        'convex': 0,
                        'skinny': 0,
                        'stringy': 0,
                        'monotonic': 0,
                        invalid: 1,
                    };
                }
            }
                function scagnoticscore3D (field1,field2,field3){
                    var matrix = Dataset.data.map(function(d){return [d[field1],d[field2],d[field3]]});
                    try {
                        var scag = scagnostics3d(matrix,{
                            binType: 'leader',
                            startBinGridSize: 20});
                        if (!isNaN(scag.skinnyScore))
                            return {
                                'outlying': scag.outlyingScore,
                                'skewed': scag.skewedScore,
                                'sparse':scag.sparseScore,
                                'clumpy':scag.clumpyScore,
                                'striated':scag.striatedScore,
                                'convex':scag.convexScore,
                                'skinny':scag.skinnyScore,
                                'stringy':scag.stringyScore,
                                'monotonic':scag.monotonicScore};
                        else return {
                            'outlying': 0,
                            'skewed': 0,
                            'sparse':0,
                            'clumpy':0,
                            'striated':0,
                            'convex':0,
                            'skinny':0,
                            'stringy':0,
                            'monotonic':0,
                            invalid:1
                        };

                    }catch(e){
                        return {
                            'outlying': 0,
                            'skewed': 0,
                            'sparse':0,
                            'clumpy':0,
                            'striated':0,
                            'convex':0,
                            'skinny':0,
                            'stringy':0,
                            'monotonic':0,
                            invalid:1,
                        };
                    }
                }
                function scagnoticscoreND (fields){
                    var matrix = Dataset.data.map(function(d){return fields.map(
                        function (f) {
                            return d[f]})});
                    try {
                        var scag = scagnosticsnd(matrix,{
                            binType: 'leader',
                            startBinGridSize: 20});
                        return {
                            'outlying': scag.outlyingScore,
                        };
                    }catch(e){
                        return {
                            'outlying': 0,
                            invalid:1,
                        };
                    }
                }



            //console.log (Dataset.schema.fieldSchema(primfield[0]));
        };
        PCAplot.workerScagnotic = undefined;
        PCAplot.calscagnotic = function (primfield){
            if (!PCAplot.workerScagnotic) {
                PCAplot.workerScagnotic = Webworker.create(calscagnotic, {async: true});
                PCAplot.workerScagnotic.run(primfield, Dataset.schema, Dataset.data).then(function (result) {
                    console.log("----------done---------------");
                    // PCAplot.firstrun = true;
                    // if(PCAplot.dim==1)
                    // PCAplot.plot(Dataset.schema.fieldSchemas.map(function(d){
                    //     var tem = {field: d.field};
                    //     tem[d.field] = d.scag;
                    //     return tem;}),PCAplot.dim);
                    PCAplot.workerScagnotic = undefined;
                }, null, function (progress) {
                    // Alerts.add(progress);
                    if (Dataset.schema.fieldSchema(progress.source).scag === undefined)
                        Dataset.schema.fieldSchema(progress.source).scag = {};
                    // if (Dataset.schema.fieldSchema(progress.target).scag === undefined)
                    //     Dataset.schema.fieldSchema(progress.target).scag = {};
                    Dataset.schema.fieldSchema(progress.source).scag[progress.target] = progress.value;
                    // Dataset.schema.fieldSchema(progress.target).scag[progress.source] = Dataset.schema.fieldSchema(progress.source).scag[progress.target];
                }).catch(function (oError) {
                    PCAplot.workerScagnotic = undefined;
                });
            }

        };

        PCAplot.updateAlternative= function (prop,dataref){


        };
        PCAplot.mark2mark = mark2mark;
        PCAplot.reset = function(hard) {
            if (PCAplot.workerScagnotic)
                PCAplot.workerScagnotic.stop();
            var spec = instantiate();
            spec.transform.filter = FilterManager.reset(null, hard);
            PCAplot.spec = spec;
            PCAplot.firstrun =true;
            PCAplot.charts.length = 0;
            PCAplot.chart=null;
            PCAplot.prop=null;
            PCAplot.alternatives=[];
            PCAplot.dataref = [];
            PCAplot.mspec = null;
            PCAplot.state = states.IDLE;
            //PCAplot.plot(Dataset.data);
        };
        PCAplot.reset();
        Dataset.onUpdate.push(function() {
            PCAplot.reset(true);
            //PCAplot.plot(Dataset.data);
        });
        return PCAplot;
    }]);
'use strict';

angular.module('vlui')
    .service('GuidePill', ['Dataset' , function (Dataset,PCAplot) {
        var GuidePill = {
            // Functions


            get: get,
            // Event

            // Event, with handler in the listener

            /** Set a fieldDef for a channel */
            set: set,

            /** Remove a fieldDef from a channel */

            // Data
            pills: {},
            /** Listener  */
            listener: null
        };

        // Add listener type that Pills just pass arguments to its listener
        // FIXME: properly implement listener pattern
        [
            'add', 'select', 'preview', 'update', 'reset', 'sort'
        ].forEach(function(listenerType) {
            GuidePill[listenerType] = function() {
                if (GuidePill.listener && GuidePill.listener[listenerType]) {
                    return GuidePill.listener[listenerType].apply(null, arguments);
                }
            };
        });



        function set(type) {
            return
        }

        /**
         * Get a fieldDef of a pill of a given channelId
         */
        function get(channelId) {
            return GuidePill.pills[channelId];
        }


        return GuidePill;
    }]);

'use strict';

angular.module('pcagnosticsviz')
  .controller('MainCtrl', ["$scope", "$document", "Spec", "Dataset", "Wildcards", "Config", "consts", "Chronicle", "Logger", "Bookmarks", "Modals", "FilterManager", "NotifyingService", "PCAplot", function($scope, $document, Spec, Dataset, Wildcards,  Config, consts, Chronicle, Logger, Bookmarks, Modals, FilterManager,NotifyingService,PCAplot) {
    $scope.Spec = Spec;
    $scope.contain = {"bi-plot":'Overview',
        "div":[{key:'guideplot',val:'Exemplar'},
            {key:'thumplot',val:'Feature pannel'},
            {key:'slideGraph',val:'Mainview view'},
            {key:'alternatives-pane',val:'Expanded views'},
            {key:'guidemenu',val:'Feature pannel'}],
        'h3':'headertext',
        "body":'body'};
    $scope.Dataset = Dataset;
    $scope.Wildcards = Wildcards;
    $scope.Config = Config;
    $scope.Logger = Logger;
    $scope.Bookmarks = Bookmarks;
    $scope.FilterManager = FilterManager;
    $scope.consts = consts;
    $scope.showDevPanel = false;
    $scope.embedded = !!consts.embeddedData;
    //  $scope.Biplot = Biplot;
    $scope.hideExplore = false;
    $scope.fieldShow = false;
    $scope.WildcardsShow = false;
    $scope.PCAplot= PCAplot;
    $scope.showEncoding = false;
    $scope.showExtraGuide = false;
    $scope.themeDrak = false;
      $scope.fieldAdd = function(fieldDef) {
          Pills.add(fieldDef);
      };
    $scope.toggleHideExplore = function() {
      $scope.hideExplore = !$scope.hideExplore;
      if ($scope.hideExplore) {
        Logger.logInteraction(Logger.actions.TOGGLE_HIDE_ALTERNATIVES, Spec.chart.shorthand);
      } else {
        Logger.logInteraction(Logger.actions.TOGGLE_SHOW_ALTERNATIVES, Spec.chart.shorthand);
      }
    };

    $scope.alternativeType = null;
    $scope.setAlternativeType = function(type, automatic) {
      $scope.alternativeType = type;
      if (!automatic) {
        $scope.hideExplore = false;
        Logger.logInteraction(Logger.actions.TOGGLE_SHOW_ALTERNATIVES, Spec.chart.shorthand);
        Logger.logInteraction(Logger.actions.SET_ALTERNATIVES_TYPE, type, {
          shorthand: Spec.chart.shorthand
        });
      }
    };


    // log event
  $scope.onMouseOverLog = function ($event) {
      var regionAction =undefined;
      $event.originalEvent.path.find(function(d) {
          if (d.tagName.toLowerCase()=='div') {
              var temp = $scope.contain['div'].find(function(c){return d.classList.contains(c.key)});
              regionAction = (temp==undefined)?undefined:temp.val;
              return temp;
          }
          else{
              regionAction = $scope.contain[d.tagName.toLowerCase()];
                return regionAction;
          }});
      if (regionAction!='body')
          Logger.logInteraction(Logger.actions.MOUSE_OVER,regionAction, {val:{region:regionAction,
                  position: {screenX:$event.screenX,
                      screenY: $event.screenY,}},time:new Date()});
  };
     // end log
    $scope.scrollToTop = function() {
      $document.find('.vis-pane-container').scrollTop(0);
    };

    $scope.groupByChanged = function() {
      Logger.logInteraction(Logger.actions.GROUP_BY_CHANGED, Spec.spec.groupBy);
    };
    $scope.autoAddCountChanged = function() {
      Logger.logInteraction(Logger.actions.AUTO_ADD_COUNT_CHANGED, Spec.spec.autoAddCount);
    };

    $scope.$watch('Spec.alternatives', function(alternatives) {
      for (var i = 0 ; i < alternatives.length; i++) {
        if ($scope.alternativeType === alternatives[i].type) {
          return;
        }
      }
      // at this point we don't have the suggestion type available, thus reset
      $scope.setAlternativeType(null, true);
    });

      $scope.$watch(function(){
          return PCAplot.mspec;
      },function(newmspec){
         console.log('logging....');
         console.log(newmspec);
      });

    // undo/redo support
    $scope.canUndo = false;
    $scope.canRedo = false;

    // bookmark
    $scope.showModal = function(modalId) {
      Modals.open(modalId);
      if (modalId == 'bookmark-list') {
        Logger.logInteraction(Logger.actions.BOOKMARK_OPEN);
      }
    };

    $scope.changetheme = function(){
        $scope.themeDrak = !$scope.themeDrak;
    };

    if (Bookmarks.isSupported) {
      // load bookmarks from local storage
      Bookmarks.load();
    }

    if ($scope.embedded) {
      // use provided data and we will hide the dataset selector
      Dataset.dataset = {
        values: consts.embeddedData,
        name: 'embedded'
      };
    }

      NotifyingService.subscribe($scope, function somethingChanged() {
          //console.log("her");
          $scope.$apply();
      });

    // initialize undo after we have a dataset
    Dataset.update(Dataset.dataset).then(function() {
      Config.updateDataset(Dataset.dataset);
      if (consts.initialSpec) {
          Spec.parseSpec(consts.initialSpec);
          PCAplot.parseSpec(consts.initialSpec);
      }
      // PCAplot.plot(Dataset.data);
      //Biplot.data = Dataset.data;
      $scope.chron = Chronicle.record('Spec.spec', $scope, true,
        ['Dataset.dataset', 'Config.config', 'FilterManager.filterIndex']);
      // $scope.chron = Chronicle.record('PCAplot.spec', $scope, true,
      //      ['Dataset.dataset', 'Config.config', 'FilterManager.filterIndex']);
      $scope.canUndoRedo = function() {
        $scope.canUndo = $scope.chron.canUndo();
        $scope.canRedo = $scope.chron.canRedo();
      };
      $scope.chron.addOnAdjustFunction($scope.canUndoRedo);
      $scope.chron.addOnUndoFunction($scope.canUndoRedo);
      $scope.chron.addOnRedoFunction($scope.canUndoRedo);

      $scope.chron.addOnUndoFunction(function() {
        Logger.logInteraction(Logger.actions.UNDO);
      });
      $scope.chron.addOnRedoFunction(function() {
        Logger.logInteraction(Logger.actions.REDO);
      });

      angular.element($document).on('keydown', function(e) {
        if (e.keyCode === 'Z'.charCodeAt(0) && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
          $scope.chron.undo();
          $scope.$digest();
          return false;
        } else if (e.keyCode === 'Y'.charCodeAt(0) && (e.ctrlKey || e.metaKey)) {
          $scope.chron.redo();
          $scope.$digest();
          return false;
        } else if (e.keyCode === 'Z'.charCodeAt(0) && (e.ctrlKey || e.metaKey) && e.shiftKey) {
          $scope.chron.redo();
          $scope.$digest();
          return false;
        }
      });
    });
  }]);

'use strict';

angular.module('pcagnosticsviz')
  .service('Alternatives', ["ANY", "vl", "cql", "util", "Chart", "Dataset", function (ANY, vl, cql, util, Chart, Dataset) {
    var Alternatives = {
      alternativeEncodings: alternativeEncodings,
      summarize: summarize,
      disaggregate: disaggregate,
      addCategoricalField: addCategoricalField,
      addQuantitativeField: addQuantitativeField,
      addTemporalField: addTemporalField,
      histograms: histograms,

      getHistograms: getHistograms,
      getAlternatives: getAlternatives
    };

    // TODO: import these from CQL once we export them!
    var GROUP_BY_SIMILAR_ENCODINGS = [
      cql.property.Property.FIELD,
      cql.property.Property.AGGREGATE,
      cql.property.Property.BIN,
      cql.property.Property.TIMEUNIT,
      cql.property.Property.TYPE,
      {
        property: cql.property.Property.CHANNEL,
        replace: {
          'x': 'xy', 'y': 'xy',
          'color': 'style', 'size': 'style', 'shape': 'style', 'opacity': 'style',
          'row': 'facet', 'column': 'facet'
        }
      }
    ];

    var GROUP_BY_SIMILAR_DATA_AND_TRANSFORM = [
      cql.property.Property.FIELD,
      cql.property.Property.AGGREGATE,
      cql.property.Property.BIN,
      cql.property.Property.TIMEUNIT,
      cql.property.Property.TYPE,
    ];

    function getHistograms(query, chart, topItem) {
      var alternative = {
        type: 'histograms',
        title: 'Univariate Summaries',
        limit: 20,
        query: histograms(query)
      };
      return [
        util.extend(alternative, {
          charts: executeQuery(alternative, chart, topItem)
        })
      ];
    }



    function getAlternatives(query, chart, topItem) {
      var isAggregate = cql.query.spec.isAggregate(query.spec);

      var alternativeTypes = [];

      var hasT = false;
      query.spec.encodings.forEach(function(encQ) {
        if (encQ.type === vl.type.TEMPORAL) {
          hasT = true;
        }
      });

      var spec = chart.vlSpec;
      var hasOpenPosition = !spec.encoding.x || !spec.encoding.y;
      var hasStyleChannel = spec.encoding.color || spec.encoding.size || spec.encoding.shape || spec.encoding.opacity;
      var hasOpenFacet = !spec.encoding.row || !spec.encoding.column;

      if (!isAggregate) {
        alternativeTypes.push({
          type: 'summarize',
          title: 'Summaries',
          filterGroupBy: GROUP_BY_SIMILAR_DATA_AND_TRANSFORM,
          limit: 2
        });
      }

      if (hasOpenPosition) {
        alternativeTypes.push({
          type: 'addQuantitativeField',
          title: 'Add Quantitative Field'
        });
      }

      if (hasOpenPosition || !hasStyleChannel) {
        alternativeTypes.push({
          type: 'addCategoricalField',
          title: 'Add Categorical Field'
        });
      }

      if (!hasOpenPosition && !hasStyleChannel) {
        alternativeTypes.push({
          type: 'addQuantitativeField',
          title: 'Add Quantitative Field'
        });
      }

      if (!hasT && hasOpenPosition) {
        alternativeTypes.push({
          type: 'addTemporalField',
          title: 'Add Temporal Field'
        });
      }

      alternativeTypes.push({
        type: 'alternativeEncodings',
        title: 'Alternative Encodings',
        filterGroupBy: GROUP_BY_SIMILAR_ENCODINGS
      });

      if (!(hasOpenPosition || !hasStyleChannel) && hasOpenFacet) {
        alternativeTypes.push({
          type: 'addCategoricalField',
          title: 'Add Categorical Field'
        });
      }

      // if (isAggregate) {
      //   alternativeTypes.push({
      //     type: 'summarize',
      //     title: 'Summaries',
      //     filterGroupBy: GROUP_BY_SIMILAR_DATA_AND_TRANSFORM
      //   });

      //   alternativeTypes.push({
      //     type: 'disaggregate',
      //     title: 'Disaggregate'
      //   });
      // }

      return alternativeTypes.map(function(alternative) {
        alternative.query = Alternatives[alternative.type](query);
        alternative.charts = executeQuery(alternative, chart, topItem);
        return alternative;
      });
    }

    function executeQuery(alternative, mainChart, mainTopItem) {
      var output = cql.query(alternative.query, Dataset.schema);

      // Don't include the specified visualization in the recommendation list
      return output.result.items
        .filter(function(item) {
          var topItem = item.getTopSpecQueryModel();
          return !mainChart || !mainChart.shorthand ||(
            topItem.toShorthand(alternative.filterGroupBy) !==
            mainTopItem.toShorthand(alternative.filterGroupBy)
          );
        })
        .map(Chart.getChart);
    }

    function makeEnumSpec(val) {
      return cql.enumSpec.isEnumSpec(val) ? val : cql.enumSpec.SHORT_ENUM_SPEC;
    }

    /**
     * Namespace for template methods for making a new SpecQuery
     */
    function alternativeEncodings(query) {
      var newSpecQ = util.duplicate(query.spec);
      newSpecQ.mark = makeEnumSpec(newSpecQ.mark);
      newSpecQ.encodings.forEach(function (encQ) {
        encQ.channel = makeEnumSpec(encQ.channel);
      });
      // TODO: extend config
      return {
        spec: newSpecQ,
        groupBy: 'encoding',
        // fieldOrder, aggregationQuality should be the same, since we have similar fields and aggregates
        orderBy: ['fieldOrder', 'aggregationQuality', 'effectiveness'],
        chooseBy: ['aggregationQuality', 'effectiveness']
      };
    }

    function summarize(query) {
      var newSpecQ = util.duplicate(query.spec);

      // Make mark an enum spec
      newSpecQ.mark = makeEnumSpec(newSpecQ.mark);

      // For convert encoding for summary
      newSpecQ.encodings = newSpecQ.encodings.reduce(function (encodings, encQ) {
        // encQ.channel = makeEnumSpec(encQ.channel);
        if (cql.enumSpec.isEnumSpec(encQ.type)) {
          // This is just in case we support type = enumSpec in the future
          encQ.aggregate = makeEnumSpec(encQ.aggregate);
          encQ.bin = makeEnumSpec(encQ.bin);
          encQ.timeUnit = makeEnumSpec(encQ.timeUnit);
        } else {
          switch (encQ.type) {
            case vl.type.Type.QUANTITATIVE:
              if (encQ.aggregate === 'count') {
                // Skip count, so that it can be added back as autoCount or omitted
                return encodings;
              } else {
                // For other Q, it should be either aggregate or binned
                encQ.aggregate = makeEnumSpec(encQ.aggregate);
                encQ.bin = makeEnumSpec(encQ.bin);
                encQ.hasFn = true;
              }
              break;
            case vl.type.Type.TEMPORAL:
              // TODO: only year and periodic timeUnit
              encQ.timeUnit = makeEnumSpec(encQ.timeUnit);
              break;
          }
        }
        return encodings.concat(encQ);
      }, []);

      // TODO: extend config
      return {
        spec: newSpecQ,
        groupBy: 'fieldTransform',
        // fieldOrder should be the same, since we have similar fields
        orderBy: ['fieldOrder', 'aggregationQuality', 'effectiveness'],
        // aggregationQuality should be the same with group with similar transform
        chooseBy: ['aggregationQuality', 'effectiveness'],
        config: {
          autoAddCount: true,
          omitRaw: true
        }
      };
    }

    function disaggregate(query) {
      var newSpecQ = util.duplicate(query.spec);
      newSpecQ.mark = makeEnumSpec(newSpecQ.mark);
      newSpecQ.encodings = newSpecQ.encodings
        .filter(function (encQ) {
          return encQ.aggregate !== 'count';
        })
        .map(function (encQ) {
          // encQ.channel = makeEnumSpec(encQ.channel);
          if (cql.enumSpec.isEnumSpec(encQ.type) || encQ.type === vl.type.Type.QUANTITATIVE) {
            delete encQ.aggregate;
            delete encQ.bin;
          }
          return encQ;
        });

      return {
        spec: newSpecQ,
        groupBy: 'fieldTransform',
        // field order would be actually the same
        orderBy: ['fieldOrder', 'aggregationQuality', 'effectiveness'],
        chooseBy: ['aggregationQuality', 'effectiveness'],
        config: {
          autoAddCount: false,
          omitAggregate: true
        }
      };
    }

    function addCategoricalField(query) {
      var newSpecQ = util.duplicate(query.spec);
      newSpecQ.encodings.push({
        channel: cql.enumSpec.SHORT_ENUM_SPEC,
        field: cql.enumSpec.SHORT_ENUM_SPEC,
        type: vl.type.Type.NOMINAL
        // type: {
        //   enum: [vl.type.Type.NOMINAL, vl.type.Type.ORDINAL]
        // }
      });
      return {
        spec: newSpecQ,
        groupBy: 'field',
        // FieldOrder should dominates everything else
        orderBy: ['fieldOrder', 'aggregationQuality', 'effectiveness'],
        // aggregationQuality should be the same
        chooseBy: ['aggregationQuality', 'effectiveness'],
        config: {
          autoAddCount: true
        }
      };
    }

    function addQuantitativeField(query) {
      var newSpecQ = util.duplicate(query.spec);
      newSpecQ.encodings.push({
        channel: cql.enumSpec.SHORT_ENUM_SPEC,
        bin: cql.enumSpec.SHORT_ENUM_SPEC,
        aggregate: cql.enumSpec.SHORT_ENUM_SPEC,
        field: cql.enumSpec.SHORT_ENUM_SPEC,
        type: vl.type.Type.QUANTITATIVE
      });
      return {
        spec: newSpecQ,
        groupBy: 'field',
        // FieldOrder should dominates everything else
        orderBy: ['fieldOrder', 'aggregationQuality', 'effectiveness'],
        chooseBy: ['aggregationQuality', 'effectiveness'],
        config: {
          autoAddCount: true
        }
      };
    }

    function addTemporalField(query) {
      var newSpecQ = util.duplicate(query.spec);
      newSpecQ.encodings.push({
        channel: cql.enumSpec.SHORT_ENUM_SPEC,
        hasFn: true,
        timeUnit: cql.enumSpec.SHORT_ENUM_SPEC,
        field: cql.enumSpec.SHORT_ENUM_SPEC,
        type: vl.type.Type.TEMPORAL
      });
      return {
        spec: newSpecQ,
        groupBy: 'field',
        // FieldOrder should dominates everything else
        orderBy: ['fieldOrder', 'aggregationQuality', 'effectiveness'],
        chooseBy: ['aggregationQuality', 'effectiveness'],
        config: {
          autoAddCount: true
        }
      };
    }

    function histograms(query) {
      return {
        spec: {
          data: query.spec.data,
          mark: cql.enumSpec.SHORT_ENUM_SPEC,
          transform: query.spec.transform,
          encodings: [
            { channel: cql.enumSpec.SHORT_ENUM_SPEC, field: cql.enumSpec.SHORT_ENUM_SPEC, bin: cql.enumSpec.SHORT_ENUM_SPEC, timeUnit: cql.enumSpec.SHORT_ENUM_SPEC, type: cql.enumSpec.SHORT_ENUM_SPEC },
            { channel: cql.enumSpec.SHORT_ENUM_SPEC, field: '*', aggregate: vl.aggregate.AggregateOp.COUNT, type: vl.type.Type.QUANTITATIVE }
          ]
        },
        groupBy: 'fieldTransform',
        // FieldOrder should dominates everything else
        orderBy: ['fieldOrder', 'aggregationQuality', 'effectiveness'],
        // aggregationQuality should be the same
        chooseBy: ['aggregationQuality', 'effectiveness'],
        config: { autoAddCount: false }
      };
    }

    return Alternatives;
  }]);

'use strict';

/**
 * @ngdoc directive
 * @name pcagnosticsviz.directive:nullFilterDirective
 * @description
 * # nullFilterDirective
 */
angular.module('pcagnosticsviz')
  .directive('nullFilterDirective', ["Spec", function (Spec) {
    return {
      templateUrl: 'components/nullfilterdirective/nullfilterdirective.html',
      restrict: 'E',
      scope: {},
      link: function postLink(scope, element, attrs) {
        // jshint unused:false
        scope.Spec = Spec;

        scope.updateFilter = function() {
          Spec.update();
        };
      }
    };
  }]);
'use strict';

angular.module('pcagnosticsviz')
  .directive('vgSpecEditor', ["Spec", function(Spec) {
    return {
      templateUrl: 'components/vgSpecEditor/vgSpecEditor.html',
      restrict: 'E',
      scope: {},
      link: function postLink(scope /*, element, attrs*/) {
        scope.Spec = Spec;
      }
    };
  }]);

'use strict';

angular.module('pcagnosticsviz')
  .directive('lyraExport', function() {
    return {
      template: '<a href="#" class="command" ng-click="export()">Export to lyra</a>',
      restrict: 'E',
      replace: true,
      scope: {},
      controller: ["$scope", "$timeout", "Spec", "Alerts", function($scope, $timeout, Spec, Alerts) {
        $scope.export = function() {
          var vgSpec = Spec.vgSpec;
          if (!vgSpec) {
            Alerts.add('No vega spec present.');
          }

          // Hack needed. See https://github.com/uwdata/lyra/issues/214
          vgSpec.marks[0]['lyra.groupType'] = 'layer';

          var lyraURL = 'http://idl.cs.washington.edu/projects/lyra/app/';
          var lyraWindow = window.open(lyraURL, '_blank');

          // HACK
          // lyraWindow.onload doesn't work across domains
          $timeout(function() {
            Alerts.add('Please check whether lyra loaded the vega spec correctly. This feature is experimental and may not work.', 5000);
            lyraWindow.postMessage({spec: vgSpec}, lyraURL);
          }, 5000);
        };
      }]
    };
  });

'use strict';
angular.module('pcagnosticsviz')
    .directive('guideMenu', function(){
        //template: "<svg id =\'bi-plot\' width=\'100%\' class=\"\"></svg>",
        return {
            templateUrl: 'components/guidemenu/guideMenu.html',
            restrict: 'E',
            scope: {
                prop: '=',
                initialLimit: '<',
                priority:'<',
                marks: '<',
                props: '=',
                limit:'=',
                limitup: '=',
            },
            replace: true,
            controller: ["$scope", "PCAplot", "Logger", "Dataset", function($scope, PCAplot, Logger,Dataset) {
                var first = true;

                //<editor-fold desc=“new area"

                //general plot variable stored
                let generalattr ={
                    svg: d3.select('.thum').select('svg'),
                    g: d3.select('.thum').select('.oneDimentional'),
                    margin: {left:20, top: 75, bottom:20    , right:20},
                    width: 1200,
                    height: 1200,
                    w: function() {return this.width-this.margin.left-this.margin.right},
                    h: function() {return this.height-this.margin.top-this.margin.bottom},
                    sw: 300,
                    sh: 100,
                    force: undefined,
                    xScale: undefined,
                    yScale: undefined,
                };
                generalattr.g.attr('transform','translate('+generalattr.margin.left+','+generalattr.margin.top+')');

                //</editor-fold>


                $scope.limit = $scope.initialLimit || (($scope.prop.dim<1)?10:5);
                // console.log("dim: " + $scope.prop.dim + "limit: " + $scope.limit);
                $scope.limitup =  ($scope.prop.pos > $scope.limit)? ($scope.prop.pos-2) : 0;

                $scope.typeChange =function (){
                    var tolog = {level_explore: $scope.prop.dim, abtraction: $scope.prop.mark, visual_feature: $scope.prop.type};
                    Logger.logInteraction(Logger.actions.FEATURE_SELECT, $scope.prop.type,{
                        val:{PS:tolog,spec:this.vlSpec,query:this.query},
                        time:new Date().getTime()});
                    first = true;
                    PCAplot.updateSpec($scope.prop);
                    $scope.limit = $scope.initialLimit || (($scope.prop.dim<1)?10:5);
                    $scope.limitup =  ($scope.prop.pos > 1 )?Math.min( $scope.limitup,($scope.prop.pos-2)): 0;
                    console.log("dim: " + $scope.prop.dim + "limit: " + $scope.limit);
                };
                $scope.previewSlider = function (index){
                    // $scope.prop.pos =index+$scope.limitup;
                    console.log(index);
                    $scope.prop.pos =index;
                    var tolog = {level_explore: $scope.prop.dim, abtraction: $scope.prop.mark, visual_feature: $scope.prop.type};
                    Logger.logInteraction(Logger.actions.FEATURE_QUICKNAVIGATION,index, {
                        val:{PS:tolog,spec:this.vlSpec,query:this.query},
                        time:new Date().getTime()});
                    //console.log($scope.prop.pos);
                };
                $scope.markChange =function (){
                    var tolog = {level_explore: $scope.prop.dim, abtraction: $scope.prop.mark, visual_feature: $scope.prop.type};
                    Logger.logInteraction(Logger.actions.TYPEPLOT_SELECT, $scope.prop.mark,{
                        val:{PS:tolog,spec:this.vlSpec,query:this.query},
                        time:new Date().getTime()});
                    first = true;
                    PCAplot.updateSpec($scope.prop);
                    $scope.limit = $scope.initialLimit || (($scope.prop.dim<1)?10:5);
                    $scope.limitup =  ($scope.prop.pos > 1 )?Math.min( $scope.limitup,($scope.prop.pos-2)): 0;
                    console.log("dim: " + $scope.prop.dim + "limit: " + $scope.limit);
                };

                // var specWatcher = $scope.$watch('prop', function(spec) {
                //     $scope.limit = first?($scope.initialLimit || (($scope.prop.dim<1)?10:5)):$scope.limit;
                //     first = false;
                //     // console.log("dim: " + $scope.prop.dim + "limit: " + $scope.limit);
                //     $scope.limitup = Math.min($scope.limitup,($scope.prop.pos > $scope.limit)? ($scope.prop.pos-2) : 0);
                //
                //
                // }, true);

                var generalWatcher = $scope.$watch('[prop.dim,prop.type,prop.mark]', function(spec) {
                    first = false;
                    updateInterface($scope.prop.dim,$scope.prop);

                }, true); //, true /* watch equality rather than reference */);

                var posWatcher = $scope.$watch('[prop.pos]', function(spec) {

                    selectInterface($scope.prop.dim,$scope.prop.pos);

                }, false);

                $scope.increaseLimit = function () {
                    $scope.limit += 4;
                };

                $scope.generateID = function (chart) {
                    return chart.fieldSet.map((d)=>d.field).join('_');
                };

                $scope.$on('$destroy', function() {
                    // Clean up watcher
                    // specWatcher();
                    generalWatcher();
                });

                function updateInterface (dim,data){
                    switch (dim){
                        case 0:
                            generalplot_1D(data);
                            break;
                        case 1:
                            generalplot_2D(data);
                            break;
                        default:
                            generalplot_nD(data);
                            break;
                    }
                }

                function selectInterface (dim,data){
                    switch (dim){
                        case 0:
                            selectplot_1D(data);
                            break;
                        case 1:
                            selectplot_2D(data);
                            break;
                        default:
                            selectplot_nD(data);
                            break;
                    }
                }
                function selectplot_nD(data){

                }
                function generalplot_1D (data) {
                    // inital value
                    if (generalattr.force) {

                    }
                    else {
                        generalattr.force = d3v4.forceSimulation()
                            .force('forceY', d3v4.forceY().strength(0.8).y(d => {
                                return generalattr.yScale(Math.abs(d.vlSpec.config.typer.val[d.vlSpec.config.typer.type]));
                            })).force('forceX', d3v4.forceX().x(function (d) {
                                return generalattr.xScale(d);
                            })).force('collision', d3v4.forceCollide().strength(1).radius(function (d) {
                                if (d.order === $scope.prop.pos || d.order === generalattr.mouseoverIndex) {
                                    return generalattr.sh / 2;
                                }
                                return generalattr.sh/4
                            }))
                            .on('tick', ticked);
                    }
                    generalattr.height = generalattr.sh*$scope.prop.previewcharts.length/2;
                    generalattr.svg.attr('viewBox',[0,0,generalattr.width,generalattr.height].join(' '));

                    var colorArray = ["#77946F","#aec7b2","#c5d6c6","#e6e6e6","#e6e6d8","#e6d49c","#e6b061","#e6852f","#e6531a","#e61e1a"];
                    var level= colorArray.length;
                    var domain = d3.range(level).map(function(d) {return d/(level-1)});

                    generalattr.colorScale = d3v4.scaleLinear()
                        .domain(domain)
                        .range(colorArray);
                    if (generalattr.g.select('defs')[0][0]==null) {
                        const defs = generalattr.g.append('defs');
                        let colorGradient = defs.append('linearGradient')
                            .attr('id','linear-gradient')
                            .attr('x1','0%')
                            .attr('x2','0%')
                            .attr('y1','100%')
                            .attr('y2','0%');
                        colorGradient.selectAll("stop").data(colorArray).enter()
                            .append('stop')
                            .attr('offset',(d,i)=> (i / (level - 1) * 100) + '%')
                            .attr('stop-color',(d)=>d);
                    }
                    let legend = d3v4.select(generalattr.g.node()).select('.legend');
                    let legednTicks = d3v4.axisLeft(d3v4.scaleLinear().domain([0,1]).range([150,0])).ticks(3).tickFormat(d3.format(".1f"));
                    if (legend.empty()) {
                        legend = d3v4.select(generalattr.g.node()).append('g')
                            .attr('class','legend').attr('transform','translate('+(generalattr.w()-30)+','+0+')');
                        legend.append('rect')
                            .attr('x',0)
                            .attr('width',30)
                            .attr('height',150)
                            .style('fill','url("#linear-gradient")');
                    }
                    legend.call(legednTicks);

                    generalattr.g = d3.select('.thum').select('.oneDimentional');
                    generalattr.g.select('.twoDimentional').selectAll('*').remove();

                    generalattr.yScale = d3v4.scaleLinear().range([generalattr.h()-generalattr.sh/2,generalattr.sh/2]);
                    generalattr.xScale = function(d){return 0};
                    generalattr.xRescale = d3v4.scaleLinear().domain([0,generalattr.sh/2]).range([generalattr.w()/2,generalattr.w()/2+generalattr.sw/2]);
                    function ticked (d){
                        const foreign = d3v4.select(".thum").selectAll('.foreignObject').data($scope.prop.previewcharts)
                            .attr ('transform',function (d){
                                return'translate('+ generalattr.xRescale(d.x) +','+ (d.y-generalattr.sh/2)+')'})
                            .on('mouseover',function (d){
                                generalattr.mouseoverIndex = d.order;
                                generalattr.force.nodes($scope.prop.previewcharts).alpha(0.01).restart();
                                d3.select(this).classed('hover',true);
                            })
                                .on('mouseleave',function (d) {
                                generalattr.mouseoverIndex = -1;
                                    generalattr.force.nodes($scope.prop.previewcharts).alpha(0.3).restart();
                                d3.select(this).classed('hover',false);
                            });
                        foreign.select('div').style('background-color',d=>generalattr.colorScale(Math.abs(d.vlSpec.config.typer.val[d.vlSpec.config.typer.type])))
                            // .attr("x", function(d){ return generalattr.xRescale(d.x); })
                            // .attr("y", function(d){ return d.y-generalattr.sh/2; })
                    }


                    // update
                    generalattr.yScale.domain(d3.extent($scope.prop.previewcharts,d=>Math.abs(d.vlSpec.config.typer.val[d.vlSpec.config.typer.type])));
                    generalattr.force.nodes($scope.prop.previewcharts).alpha(0.3).restart();
                    // fixedSizeForeignObjects(d3v4.select(".thum").selectAll('foreignObject').nodes());

                }

                function selectplot_1D (index) {
                    // generalattr.g.selectAll('.active').classed('active',false);
                    // generalattr.g.selectAll('.foreignObject').filter(d=>d.order==index).classed('active',true);
                    generalattr.force.nodes($scope.prop.previewcharts).alpha(0.3).restart();
                }

                function selectplot_2D (index) {
                    generalattr.g.selectAll('.active').classed('active',false);
                    generalattr.g.selectAll('.cell').filter(d=>d.order==index).classed('active',true);
                }

                function generalplot_2D (data) {
                    // clean
                    if (generalattr.force) {
                        generalattr.force.stop();
                    }
                    // init
                    generalattr.height = generalattr.w()+generalattr.margin.top+generalattr.margin.bottom;
                    generalattr.svg.attr('viewBox',[0,0,generalattr.width,generalattr.height]);
                    generalattr.g = d3.select('.thum').select('.twoDimentional');


                    let sizescale = d3v4.scaleLinear()
                        .domain([0,1])
                        .range([0.5,1]);

                    // update

                    let domainByTrait = {},
                        traits = Dataset.schema.fieldSchemas.map(d=>{return {text:d.field,value:0}});

                    traits.forEach(function(trait) {
                        trait.value = d3.sum($scope.prop.previewcharts.filter(pc=> pc.fieldSet.find(f=> f.field === trait.text) !== undefined ).map(d=>Math.abs(d.vlSpec.config.typer.val[d.vlSpec.config.typer.type])));
                        domainByTrait[trait] = [Dataset.schema.fieldSchema(trait.text).stats.min,Dataset.schema.fieldSchema(trait.text).stats.max];

                    });
                    traits.sort((a,b)=>b.value-a.value);

                    generalattr.xScale = d3v4.scaleBand().paddingInner(0.05).paddingOuter(0.5).range([0, generalattr.w()]).round(true).domain(traits.map(d=>d.text));
                    generalattr.yScale = d3v4.scaleBand().paddingInner(0.05).paddingOuter(0.5).range([0, generalattr.h()]).round(true).domain(traits.map(d=>d.text));

                    let x = d3v4.scaleLinear()
                        .range([0, generalattr.xScale.bandwidth()]);
                    let y = d3v4.scaleLinear()
                        .range([0,generalattr.yScale.bandwidth()]);

                    $scope.prop.previewcharts.forEach(d=>{
                        const pos = [d.fieldSet[0].field,d.fieldSet[1].field];
                        pos.sort((a,b)=>a-b);
                        d.id = pos.join('|') + pos.reverse().join('|');
                    });

                    let labels = generalattr.g.selectAll(".mlabel")
                        .data(traits,d=>d.text);
                    labels.transition().duration(generalattr.w()).delay(function(d, i) { return generalattr.xScale(d.text); }).call(updateLabel);
                    labels.exit().remove();
                    labels.enter().call(plotLabel);

                    let cells = generalattr.g.selectAll(".cell")
                        .data($scope.prop.previewcharts,d=>d.id);
                    cells.transition().duration(generalattr.w()).delay(function(d, i) { return generalattr.xScale(d.fieldSet[0].field); }).call(updateplot);
                    cells.exit().remove();
                    cells.enter().call(plot);

                    function plot(p) {
                        return p.append("g")
                            .attr("class", "cell")
                            .attr("transform", function(d) {
                                const pos = [generalattr.xScale(d.fieldSet[0].field),generalattr.xScale(d.fieldSet[1].field)];
                                pos.sort((a,b)=>a-b);
                                return "translate(" + pos[0] + "," + pos[1] + ")"; })
                            .on('click', function (d,i){
                                generalattr.g.selectAll('.active').classed('active',false);
                                d3.select(this).classed('active',true);
                                $scope.previewSlider(d.order)})
                            .append("rect")
                            // .attr("transform", function(d) {
                            //     const pos = (1-sizescale(Math.abs(d.vlSpec.config.typer.val[d.vlSpec.config.typer.type])))*generalattr.xScale.bandwidth()/2;
                            //     return "translate(" + pos + "," + pos + ")"; })
                            .attr("class", "frame")
                            .style("fill",d=>generalattr.colorScale(Math.abs(d.vlSpec.config.typer.val[d.vlSpec.config.typer.type])))
                            .attr("width", d => generalattr.xScale.bandwidth())
                            .attr("height",d => generalattr.xScale.bandwidth());
                    }

                    function updateplot(p) {
                        return p.attr("transform", function(d) {
                            const pos = [generalattr.xScale(d.fieldSet[0].field),generalattr.xScale(d.fieldSet[1].field)];
                            pos.sort((a,b)=>a-b);
                            return "translate(" + pos[0] + "," + pos[1] + ")"; })
                            .select(".frame")
                            // .attr("transform", function(d) {
                            //     const pos = (1-sizescale(Math.abs(d.vlSpec.config.typer.val[d.vlSpec.config.typer.type])))*generalattr.xScale.bandwidth()/2;
                            //     return "translate(" + pos + "," + pos + ")"; })
                            .style("fill",d=>generalattr.colorScale(Math.abs(d.vlSpec.config.typer.val[d.vlSpec.config.typer.type])))
                            .attr("width", d => generalattr.xScale.bandwidth())
                            .attr("height",d => generalattr.xScale.bandwidth());
                    }

                    function plotLabel(p) {
                        return p.append("g")
                            .attr("class", "mlabel")
                            .attr("transform", function(d) {
                                const pos = [generalattr.xScale(d.text)+generalattr.xScale.bandwidth()/2,generalattr.xScale(d.text)+generalattr.xScale.bandwidth()/2];
                                return "translate(" + pos[0] + "," + pos[1] + ")"; })
                            .append("text")
                            .attr("class", "mlabeltext")
                            .attr('dy','0.5em')
                            .text(d=>d.text);
                    }

                    function updateLabel(p) {
                        return p.attr("transform", function(d) {
                            const pos = [generalattr.xScale(d.text)+generalattr.xScale.bandwidth()/2,generalattr.xScale(d.text)+generalattr.xScale.bandwidth()/2];
                            return "translate(" + pos[0] + "," + pos[1] + ")"; });
                    }

                }

                function generalplot_nD (data) {
                    generalattr.g.selectAll('*').remove();
                }


            }]
        }
    })
    .directive('foRepeatDirective', function() {
        return function(scope, element, attrs) {

            if (scope.$last){
                // d3.select('.thum').select('.oneDimentional').selectAll('.active').classed('active',false);
                // d3.select('.thum').select('.oneDimentional').selectAll('foreignObject').filter(d=>d.order==index).classed('active',true);
                // window.alert("im the last!");
            }
        };
    });

'use strict';
angular.module('pcagnosticsviz')
    .directive('slideGraph', ["PCAplot", "Spec", "Pills", "Logger", function(PCAplot,Spec,Pills,Logger){
        //template: "<svg id =\'bi-plot\' width=\'100%\' class=\"\"></svg>",
        return {
            templateUrl: 'components/d3-slidegraph/slide-graph.html',
            replace: true,
            scope: {
                charts: '=', // One
                pos: '=',
                postSelectAction: '&',
                limit: '=',
                limitup: '=',
            },
            link: function postLink(scope,element) {
                scope.limitconst = 1;
                scope.buffer = [];
                var itemCount = scope.charts.length;
                var items = d3.select(".items-slider");
                //scope.PCAplot = PCAplot;
                // console.log (scope.charts);
                function setTransform() {
                    //items.style("transform",'translate3d(' + (-pos * items.node().offsetWidth) + 'px,0,0)');
                    items.style("transform",'translate3d(0,' + (-(scope.pos) * items.node().offsetHeight) + 'px,0)');
                    // items.style("transform",'translate3d(0,' + (-(scope.pos-scope.limitup) * items.node().offsetHeight) + 'px,0)');
                }

                // const chartsWatcher =scope.$watch("charts",function(){
                //     console.log(scope.charts)
                //     if (scope.charts) {
                //         update_buffer(scope.pos);
                //         setTransform();
                //     }
                // },true);

                const posWatcher = scope.$watch("pos",function(){
                    console.log(scope.pos)
                    if (scope.pos!=-1) {
                        setTransform();
                        //PCAplot.alternativeupdate( scope.charts[scope.pos]);
                        PCAplot.prop.mspec = scope.charts[scope.pos];
                        update_buffer(scope.pos);
                        scope.limitup = scope.pos;//Math.min(scope.limitup,(scope.pos > scope.limit)? (scope.pos-2) : 0);
                        // scope.charts[scope.pos].vlSpec.config.typer = PCAplot.prop.mspec.config.typer;
                        console.log(scope.buffer[scope.pos])
                        setTransform();
                        Pills.select(scope.charts[scope.pos].vlSpec);
                    }
                },true);


                scope.prev = function() {
                    scope.pos = Math.max(scope.pos - 1, 0);
                    if (scope.pos != scope.limitup)
                        update_buffer(scope.limitup, scope.pos);
                    scope.limitup = scope.pos;//Math.min(scope.limitup,(scope.pos > scope.limit)? (scope.pos-2) : 0);
                    Logger.logInteraction(Logger.actions.MAINVIEW_NAVIGATION, scope.pos,{
                        val:{spec:this.charts[scope.pos].vlSpec,query:this.charts[scope.pos].query},
                        time:new Date().getTime()});
                    setTransform();
                };

                scope.next = function () {
                    scope.pos = Math.min(scope.pos + 1, itemCount - 1);
                    scope.limitup = scope.pos;
                    console.log("--------"+scope.limitup)
                    if (scope.pos != scope.limitup)
                        update_buffer(scope.pos);
                    // if (scope.pos > scope.limit-1) {
                    //     scope.limitup = scope.pos//Math.min(scope.limitup,(scope.pos > scope.limit)? (scope.pos-2) : 0);
                        // scope.limit = 3//scope.pos + 2;
                    // }
                    Logger.logInteraction(Logger.actions.MAINVIEW_NAVIGATION, scope.pos,{
                        val:{spec:this.charts[scope.pos].vlSpec,query:this.charts[scope.pos].query},
                        time:new Date().getTime()});
                    setTransform();
                };
                function init_buffer() {
                        scope.buffer = new Array(scope.charts.length);
                }
                function update_buffer(new_pos) {
                    init_buffer();
                    scope.buffer[new_pos] = _.cloneDeep( scope.charts[new_pos]);
                }

                scope.$on('$destroy', function() {
                    console.log('guideplot destroyed');
                    posWatcher();
                });
            }
        }
    }]);

'use strict';
angular.module('pcagnosticsviz')
    .directive('slideCom', function(){
        //template: "<svg id =\'bi-plot\' width=\'100%\' class=\"\"></svg>",
        return {
            templateUrl: 'components/d3-slidegraph/slide-com.html',
            replace: true,
            scope: {
                chart: '<', // Two-way
            },

            link: function postLink(scope, element) {
                // console.log(element.height());
        //GuidePill.get();
                // console.log(scope.chart);
                // d3.selectAll('.background-guideplot')
                //     .style('fill', '#ffffff')
                //     .attr('width', $('.guideplot').width())
                //     .attr('height', $('.guideplot').height());
                //$scope.idplot = "gplot"+$scope.pcdDef;

            }
        }
    });

'use strict';

angular.module('pcagnosticsviz')
  .directive('jsonInput', ["JSON3", function(JSON3) {
    return {
      restrict: 'A',
      require: 'ngModel',
      scope: {},
      link: function(scope, element, attrs, modelCtrl) {
        var format = function(inputValue) {
          return JSON3.stringify(inputValue, null, '  ', 80);
        };
        modelCtrl.$formatters.push(format);
      }
    };
  }]);

'use strict';
angular.module('pcagnosticsviz')
    .directive('guidePlot', ["PCAplot", function(PCAplot) {
        //template: "<svg id =\'bi-plot\' width=\'100%\' class=\"\"></svg>",
        return {
            templateUrl: 'components/d3-guideplot/guide-plot.html',
            replace: true,
            restrict: 'E',
            scope: {
                pcaDefs: '<',
            },
            link: function ($scope) {
                //scope.PCAplot = PCAplot;
            }
        }
    }]);

'use strict';
angular.module('pcagnosticsviz')
    .directive('gPlot', ["PCAplot", function(PCAplot){
        //template: "<svg id =\'bi-plot\' width=\'100%\' class=\"\"></svg>",
        return {
            templateUrl: 'components/d3-guideplot/gplot.html',
            replace: true,
            scope: {
                pcaDef: '=', // Two-way
            },
            link: function postLink(scope, element){
                scope.PCAplot = PCAplot;
                d3.select(element[0]).select('svg')
                    .attr('width',element.width())
                    .attr('height',element.height());
                PCAplot.plotguide(d3.select(element[0]).select('svg'), scope.pcaDef[0],scope.pcaDef[1]);
            },
            controller: ["$scope", function ($scope) {
                console.log("me");
                // d3.selectAll('.background-guideplot')
                //     .style('fill', '#ffffff')
                //     .attr('width', $('.guideplot').width())
                //     .attr('height', $('.guideplot').height());
                //$scope.idplot = "gplot"+$scope.pcdDef;
            }]
        }
    }]);

(function() {

// Inspired by http://informationandvisualization.de/blog/box-plot
    d3.box = function() {
        var width = 1,
            height = 1,
            duration = 0,
            domain = null,
            value = Number,
            whiskers = boxWhiskers,
            quartiles = boxQuartiles,
            showLabels = true, // whether or not to show text labels
            numBars = 4,
            curBar = 1,
            tickFormat = null;

        // For each small multiple…
        function box(g) {
            g.each(function(data, i) {
                //d = d.map(value).sort(d3.ascending);
                //var boxIndex = data[0];
                //var boxIndex = 1;
                var d = data[1].sort(d3.ascending);

                // console.log(boxIndex);
                //console.log(d);

                var g = d3.select(this),
                    n = d.length,
                    min = d[0],
                    max = d[n - 1];

                // Compute quartiles. Must return exactly 3 elements.
                var quartileData = d.quartiles = quartiles(d);

                // Compute whiskers. Must return exactly 2 elements, or null.
                var whiskerIndices = whiskers && whiskers.call(this, d, i),
                    whiskerData = whiskerIndices && whiskerIndices.map(function(i) { return d[i]; });

                // Compute outliers. If no whiskers are specified, all data are "outliers".
                // We compute the outliers as indices, so that we can join across transitions!
                var outlierIndices = whiskerIndices
                    ? d3.range(0, whiskerIndices[0]).concat(d3.range(whiskerIndices[1] + 1, n))
                    : d3.range(n);

                // Compute the new x-scale.
                var x1 = d3.scale.linear()
                    .domain(domain && domain.call(this, d, i) || [min, max])
                    .range([height, 0]);

                // Retrieve the old x-scale, if this is an update.
                var x0 = this.__chart__ || d3.scale.linear()
                    .domain([0, Infinity])
                    // .domain([0, max])
                    .range(x1.range());

                // Stash the new scale.
                this.__chart__ = x1;

                // Note: the box, median, and box tick elements are fixed in number,
                // so we only have to handle enter and update. In contrast, the outliers
                // and other elements are variable, so we need to exit them! Variable
                // elements also fade in and out.

                // Update center line: the vertical line spanning the whiskers.
                var center = g.selectAll("line.center")
                    .data(whiskerData ? [whiskerData] : []);

                //vertical line
                center.enter().insert("line", "rect")
                    .attr("class", "center")
                    .attr("x1", width / 2)
                    .attr("y1", function(d) { return x0(d[0]); })
                    .attr("x2", width / 2)
                    .attr("y2", function(d) { return x0(d[1]); })
                    .style("opacity", 1e-6)
                    .transition()
                    .duration(duration)
                    .style("opacity", 1)
                    .attr("y1", function(d) { return x1(d[0]); })
                    .attr("y2", function(d) { return x1(d[1]); });

                center.transition()
                    .duration(duration)
                    .style("opacity", 1)
                    .attr("y1", function(d) { return x1(d[0]); })
                    .attr("y2", function(d) { return x1(d[1]); });

                center.exit().transition()
                    .duration(duration)
                    .style("opacity", 1e-6)
                    .attr("y1", function(d) { return x1(d[0]); })
                    .attr("y2", function(d) { return x1(d[1]); })
                    .remove();

                // Update innerquartile box.
                var box = g.selectAll("rect.box")
                    .data([quartileData]);

                box.enter().append("rect")
                    .attr("class", "box")
                    .attr("x", 0)
                    .attr("y", function(d) { return x0(d[2]); })
                    .attr("width", width)
                    .attr("height", function(d) { return x0(d[0]) - x0(d[2]); })
                    .transition()
                    .duration(duration)
                    .attr("y", function(d) { return x1(d[2]); })
                    .attr("height", function(d) { return x1(d[0]) - x1(d[2]); });

                box.transition()
                    .duration(duration)
                    .attr("y", function(d) { return x1(d[2]); })
                    .attr("height", function(d) { return x1(d[0]) - x1(d[2]); });

                // Update median line.
                var medianLine = g.selectAll("line.median")
                    .data([quartileData[1]]);

                medianLine.enter().append("line")
                    .attr("class", "median")
                    .attr("x1", 0)
                    .attr("y1", x0)
                    .attr("x2", width)
                    .attr("y2", x0)
                    .transition()
                    .duration(duration)
                    .attr("y1", x1)
                    .attr("y2", x1);

                medianLine.transition()
                    .duration(duration)
                    .attr("y1", x1)
                    .attr("y2", x1);

                // Update whiskers.
                var whisker = g.selectAll("line.whisker")
                    .data(whiskerData || []);

                whisker.enter().insert("line", "circle, text")
                    .attr("class", "whisker")
                    .attr("x1", 0)
                    .attr("y1", x0)
                    .attr("x2", 0 + width)
                    .attr("y2", x0)
                    .style("opacity", 1e-6)
                    .transition()
                    .duration(duration)
                    .attr("y1", x1)
                    .attr("y2", x1)
                    .style("opacity", 1);

                whisker.transition()
                    .duration(duration)
                    .attr("y1", x1)
                    .attr("y2", x1)
                    .style("opacity", 1);

                whisker.exit().transition()
                    .duration(duration)
                    .attr("y1", x1)
                    .attr("y2", x1)
                    .style("opacity", 1e-6)
                    .remove();

                // Update outliers.
                var outlier = g.selectAll("circle.outlier")
                    .data(outlierIndices, Number);

                outlier.enter().insert("circle", "text")
                    .attr("class", "outlier")
                    .attr("r", 5)
                    .attr("cx", width / 2)
                    .attr("cy", function(i) { return x0(d[i]); })
                    .style("opacity", 1e-6)
                    .transition()
                    .duration(duration)
                    .attr("cy", function(i) { return x1(d[i]); })
                    .style("opacity", 1);

                outlier.transition()
                    .duration(duration)
                    .attr("cy", function(i) { return x1(d[i]); })
                    .style("opacity", 1);

                outlier.exit().transition()
                    .duration(duration)
                    .attr("cy", function(i) { return x1(d[i]); })
                    .style("opacity", 1e-6)
                    .remove();

                // Compute the tick format.
                var format = tickFormat || x1.tickFormat(8);

                // Update box ticks.
                var boxTick = g.selectAll("text.box")
                    .data(quartileData);
                if(showLabels == true) {
                    boxTick.enter().append("text")
                        .attr("class", "box")
                        .attr("dy", ".3em")
                        .attr("dx", function(d, i) { return i & 1 ? 6 : -6 })
                        .attr("x", function(d, i) { return i & 1 ?  + width : 0 })
                        .attr("y", x0)
                        .attr("text-anchor", function(d, i) { return i & 1 ? "start" : "end"; })
                        .text(format)
                        .transition()
                        .duration(duration)
                        .attr("y", x1);
                }

                boxTick.transition()
                    .duration(duration)
                    .text(format)
                    .attr("y", x1);

                // Update whisker ticks. These are handled separately from the box
                // ticks because they may or may not exist, and we want don't want
                // to join box ticks pre-transition with whisker ticks post-.
                var whiskerTick = g.selectAll("text.whisker")
                    .data(whiskerData || []);
                if(showLabels == true) {
                    whiskerTick.enter().append("text")
                        .attr("class", "whisker")
                        .attr("dy", ".3em")
                        .attr("dx", 6)
                        .attr("x", width)
                        .attr("y", x0)
                        .text(format)
                        .style("opacity", 1e-6)
                        .transition()
                        .duration(duration)
                        .attr("y", x1)
                        .style("opacity", 1);
                }
                whiskerTick.transition()
                    .duration(duration)
                    .text(format)
                    .attr("y", x1)
                    .style("opacity", 1);

                whiskerTick.exit().transition()
                    .duration(duration)
                    .attr("y", x1)
                    .style("opacity", 1e-6)
                    .remove();
            });
            d3.timer.flush();
        }

        box.width = function(x) {
            if (!arguments.length) return width;
            width = x;
            return box;
        };

        box.height = function(x) {
            if (!arguments.length) return height;
            height = x;
            return box;
        };

        box.tickFormat = function(x) {
            if (!arguments.length) return tickFormat;
            tickFormat = x;
            return box;
        };

        box.duration = function(x) {
            if (!arguments.length) return duration;
            duration = x;
            return box;
        };

        box.domain = function(x) {
            if (!arguments.length) return domain;
            domain = x == null ? x : d3.functor(x);
            return box;
        };

        box.value = function(x) {
            if (!arguments.length) return value;
            value = x;
            return box;
        };

        box.whiskers = function(x) {
            if (!arguments.length) return whiskers;
            whiskers = x;
            return box;
        };

        box.showLabels = function(x) {
            if (!arguments.length) return showLabels;
            showLabels = x;
            return box;
        };

        box.quartiles = function(x) {
            if (!arguments.length) return quartiles;
            quartiles = x;
            return box;
        };

        return box;
    };

    function boxWhiskers(d) {
        return [0, d.length - 1];
    }

    function boxQuartiles(d) {
        return [
            d3.quantile(d, .25),
            d3.quantile(d, .5),
            d3.quantile(d, .75)
        ];
    }

})();
var PCA = function(){
    this.scale = scale;
    this.pca = pca;

    function mean(X){
        // mean by col
        var T = transpose(X);
        return T.map(function(row){ return d3.sum(row) / X.length; });
    }

    function transpose(X){
        return d3.range(X[0].length).map(function(i){
            return X.map(function(row){ return row[i]; });
        });
    }

    function dot(X,Y){
        return X.map(function(row){
            return transpose(Y).map(function(col){
                return d3.sum(d3.zip(row,col).map(function(v){
                    return v[0]*v[1];
                }));
            });
        });
    }

    function diag(X){
        return d3.range(X.length).map(function(i){
            return d3.range(X.length).map(function(j){ return (i === j) ? X[i] : 0; });
        });
    }

    function zeros(i,j){
        return d3.range(i).map(function(row){
            return d3.range(j).map(function(){ return 0; });
        });
    }

    function trunc(X,d){
        return X.map(function(row){
            return row.map(function(x){ return (x < d) ? 0 : x; });
        });
    }

    function same(X,Y){
        return d3.zip(X,Y).map(function(v){
            return d3.zip(v[0],v[1]).map(function(w){ return w[0] === w[1]; });
        }).map(function(row){
            return row.reduce(function(x,y){ return x*y; });
        }).reduce(function(x,y){ return x*y; });
    }

    function std(X){
        var m = mean(X);
        return sqrt(mean(mul(X,X)));//, mul(m,m));
    }

    function sqrt(V){
        return V.map(function(x){ return Math.sqrt(x); });
    }

    function mul(X,Y){
        return d3.zip(X,Y).map(function(v){
            if (typeof(v[0]) === 'number') return v[0]*v[1];
            return d3.zip(v[0],v[1]).map(function(w){ return w[0]*w[1]; });
        });
    }

    function sub(x,y){
        console.assert(x.length === y.length, 'dim(x) == dim(y)');
        return d3.zip(x,y).map(function(v){
            if (typeof(v[0]) === 'number') return v[0]-v[1];
            else return d3.zip(v[0],v[1]).map(function(w){ return w[0]-w[1]; });
        });
    }

    function div(x,y){
        console.assert(x.length === y.length, 'dim(x) == dim(y)');
        return d3.zip(x,y).map(function(v){ return v[1]!==0 ? v[0]/(v[1]): 0; });

    }

    function scale(X, center, scale){
        // compatible with R scale()
        if (center){
            var m = mean(X);
            X = X.map(function(row){ return sub(row, m); });
        }

        if (scale){
            var s = std(X);
            X = X.map(function(row){ return div(row, s); });
        }
        return X;
    }

    // translated from http://stitchpanorama.sourceforge.net/Python/svd.py
    function svd(A){
        var temp;
        // Compute the thin SVD from G. H. Golub and C. Reinsch, Numer. Math. 14, 403-420 (1970)
        var prec = Math.pow(2,-52); // assumes double prec
        var tolerance = 1.e-64/prec;
        var itmax = 50;
        var c = 0;
        var i = 0;
        var j = 0;
        var k = 0;
        var l = 0;

        var u = A.map(function(row){ return row.slice(0); });
        var m = u.length;
        var n = u[0].length;

        console.assert(m >= n, 'Need more rows than columns');

        var e = d3.range(n).map(function(){ return 0; });
        var q = d3.range(n).map(function(){ return 0; });
        var v = zeros(n,n);

        function pythag(a,b){
            a = Math.abs(a);
            b = Math.abs(b);
            if (a > b)
                return a*Math.sqrt(1.0+(b*b/a/a));
            else if (b === 0)
                return a;
            return b*Math.sqrt(1.0+(a*a/b/b));
        }

        // Householder's reduction to bidiagonal form
        var f = 0;
        var g = 0;
        var h = 0;
        var x = 0;
        var y = 0;
        var z = 0;
        var s = 0;

        for (i=0; i < n; i++)
        {
            e[i]= g;
            s= 0.0;
            l= i+1;
            for (j=i; j < m; j++)
                s += (u[j][i]*u[j][i]);
            if (s <= tolerance)
                g= 0.0;
            else
            {
                f= u[i][i];
                g= Math.sqrt(s);
                if (f >= 0.0) g= -g;
                h= f*g-s;
                u[i][i]=f-g;
                for (j=l; j < n; j++)
                {
                    s= 0.0;
                    for (k=i; k < m; k++)
                        s += u[k][i]*u[k][j]
                    f= s/h;
                    for (k=i; k < m; k++)
                        u[k][j]+=f*u[k][i]
                }
            }
            q[i]= g;
            s= 0.0;
            for (j=l; j < n; j++)
                s= s + u[i][j]*u[i][j]
            if (s <= tolerance)
                g= 0.0;
            else
            {
                f= u[i][i+1];
                g= Math.sqrt(s);
                if (f >= 0.0) g= -g;
                h= f*g - s;
                u[i][i+1] = f-g;
                for (j=l; j < n; j++) e[j]= u[i][j]/h
                for (j=l; j < m; j++)
                {
                    s=0.0;
                    for (k=l; k < n; k++)
                        s += (u[j][k]*u[i][k])
                    for (k=l; k < n; k++)
                        u[j][k]+=s*e[k]
                }
            }
            y= Math.abs(q[i])+Math.abs(e[i]);
            if (y>x)
                x=y;
        }

        // accumulation of right hand gtransformations
        for (i = n-1; i !== -1; i+= -1)
        {
            if (g !== 0.0)
            {
                h= g*u[i][i+1];
                for (j=l; j < n; j++)
                    v[j][i]=u[i][j]/h
                for (j=l; j < n; j++)
                {
                    s=0.0;
                    for (k=l; k < n; k++)
                        s += u[i][k]*v[k][j]
                    for (k=l; k < n; k++)
                        v[k][j]+=(s*v[k][i])
                }
            }
            for (j=l; j < n; j++)
            {
                v[i][j] = 0;
                v[j][i] = 0;
            }
            v[i][i] = 1;
            g= e[i];
            l= i
        }

        // accumulation of left hand transformations
        for (i=n-1; i !== -1; i+= -1)
        {
            l= i+1;
            g= q[i];
            for (j=l; j < n; j++)
                u[i][j] = 0;
            if (g !== 0.0)
            {
                h= u[i][i]*g;
                for (j=l; j < n; j++)
                {
                    s=0.0;
                    for (k=l; k < m; k++) s += u[k][i]*u[k][j];
                    f= s/h;
                    for (k=i; k < m; k++) u[k][j]+=f*u[k][i];
                }
                for (j=i; j < m; j++) u[j][i] = u[j][i]/g;
            }
            else
                for (j=i; j < m; j++) u[j][i] = 0;
            u[i][i] += 1;
        }

        // diagonalization of the bidiagonal form
        prec= prec*x;
        for (k=n-1; k !== -1; k+= -1)
        {
            for (var iteration=0; iteration < itmax; iteration++)
            {// test f splitting
                var test_convergence = false;
                for (l=k; l !== -1; l+= -1)
                {
                    if (Math.abs(e[l]) <= prec){
                        test_convergence= true;
                        break
                    }
                    if (Math.abs(q[l-1]) <= prec)
                        break
                }
                if (!test_convergence){
                    // cancellation of e[l] if l>0
                    c= 0.0;
                    s= 1.0;
                    var l1= l-1;
                    for (i =l; i<k+1; i++)
                    {
                        f= s*e[i];
                        e[i]= c*e[i];
                        if (Math.abs(f) <= prec)
                            break;
                        g= q[i];
                        h= pythag(f,g);
                        q[i]= h;
                        c= g/h;
                        s= -f/h;
                        for (j=0; j < m; j++)
                        {
                            y= u[j][l1];
                            z= u[j][i];
                            u[j][l1] =  y*c+(z*s);
                            u[j][i] = -y*s+(z*c);
                        }
                    }
                }
                // test f convergence
                z= q[k];
                if (l=== k){
                    //convergence
                    if (z<0.0)
                    { //q[k] is made non-negative
                        q[k]= -z;
                        for (j=0; j < n; j++)
                            v[j][k] = -v[j][k]
                    }
                    break  //break out of iteration loop and move on to next k value
                }

                console.assert(iteration < itmax-1, 'Error: no convergence.');

                // shift from bottom 2x2 minor
                x= q[l];
                y= q[k-1];
                g= e[k-1];
                h= e[k];
                f= ((y-z)*(y+z)+(g-h)*(g+h))/(2.0*h*y);
                g= pythag(f,1.0);
                if (f < 0.0)
                    f= ((x-z)*(x+z)+h*(y/(f-g)-h))/x;
                else
                    f= ((x-z)*(x+z)+h*(y/(f+g)-h))/x;
                // next QR transformation
                c= 1.0;
                s= 1.0;
                for (i=l+1; i< k+1; i++)
                {
                    g = e[i];
                    y = q[i];
                    h = s*g;
                    g = c*g;
                    z = pythag(f,h);
                    e[i-1] = z;
                    c = f/z;
                    s = h/z;
                    f = x*c+g*s;
                    g = -x*s+g*c;
                    h = y*s;
                    y = y*c;
                    for (j =0; j < n; j++)
                    {
                        x = v[j][i-1];
                        z = v[j][i];
                        v[j][i-1]  = x*c+z*s;
                        v[j][i]  = -x*s+z*c;
                    }
                    z = pythag(f,h);
                    q[i-1] = z;
                    c = f/z;
                    s = h/z;
                    f = c*g+s*y;
                    x = -s*g+c*y;
                    for (j =0; j < m; j++)
                    {
                        y = u[j][i-1];
                        z = u[j][i];
                        u[j][i-1]  = y*c+z*s;
                        u[j][i]  = -y*s+z*c;
                    }
                }
                e[l] = 0.0;
                e[k] = f;
                q[k] = x;
            }
        }

        // vt = transpose(v)
        // return (u,q,vt)
        for (i=0;i<q.length; i++)
            if (q[i] < prec) q[i] = 0;

        // sort eigenvalues
        for (i=0; i< n; i++){
            // writeln(q)
            for (j=i-1; j >= 0; j--){
                if (q[j] < q[i]){
                    // writeln(i,'-',j)
                    c = q[j];
                    q[j] = q[i];
                    q[i] = c;
                    for (k=0;k<u.length;k++) { temp = u[k][i]; u[k][i] = u[k][j]; u[k][j] = temp; }
                    for (k=0;k<v.length;k++) { temp = v[k][i]; v[k][i] = v[k][j]; v[k][j] = temp; }
                    i = j
                }
            }
        }
        return { U:u, S:q, V:v }
    }

    function pca(X,npc){
        var USV = svd(X);
        var U = USV.U;
        var S = diag(USV.S);
        var V = USV.V;

        // T = X*V = U*S
        var pcXV = dot(X,V);
        var pcUdS = dot(U,S);

        var prod = trunc(sub(pcXV,pcUdS), 1e-12);
        var zero = zeros(prod.length, prod[0].length);
        console.assert(same(prod,zero), 'svd and eig ways must be the same.');
        var twomost = [0,1];
        for (var i in USV.S) {
            if (USV.S[i]>=USV.S[twomost[0]])
                twomost[0] = parseInt(i);
            else if (USV.S[i]>=USV.S[twomost[1]])
                twomost[1] = parseInt(i);
        }
        return [pcUdS,V,twomost] ;
    }
};
// d3.tip
// Copyright (c) 2013 Justin Palmer
// ES6 / D3 v4 Adaption Copyright (c) 2016 Constantin Gavrilete
// Removal of ES6 for D3 v4 Adaption Copyright (c) 2016 David Gotz
//
// Tooltips for d3.js SVG visualizations

d3.functor = function functor(v) {
    return typeof v === "function" ? v : function() {
        return v;
    };
};

d3.tip = function() {

    var direction = d3_tip_direction,
        offset    = d3_tip_offset,
        html      = d3_tip_html,
        node      = initNode(),
        svg       = null,
        point     = null,
        target    = null

    function tip(vis) {
        svg = getSVGNode(vis)
        point = svg.createSVGPoint()
        document.body.appendChild(node)
    }

    // Public - show the tooltip on the screen
    //
    // Returns a tip
    tip.show = function() {
        var args = Array.prototype.slice.call(arguments)
        if(args[args.length - 1] instanceof SVGElement) target = args.pop()

        var content = html.apply(this, args),
            poffset = offset.apply(this, args),
            dir     = direction.apply(this, args),
            nodel   = getNodeEl(),
            i       = directions.length,
            coords,
            scrollTop  = document.documentElement.scrollTop || document.body.scrollTop,
            scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft

        nodel.html(content)
            .style('position', 'absolute')
            .style('opacity', 1)
            .style('pointer-events', 'all')

        while(i--) nodel.classed(directions[i], false)
        coords = direction_callbacks[dir].apply(this)
        nodel.classed(dir, true)
            .style('top', (coords.top +  poffset[0]) + scrollTop + 'px')
            .style('left', (coords.left + poffset[1]) + scrollLeft + 'px')

        return tip
    }

    // Public - hide the tooltip
    //
    // Returns a tip
    tip.hide = function() {
        var nodel = getNodeEl()
        nodel
            .style('opacity', 0)
            .style('pointer-events', 'none')
        return tip
    }

    // Public: Proxy attr calls to the d3 tip container.  Sets or gets attribute value.
    //
    // n - name of the attribute
    // v - value of the attribute
    //
    // Returns tip or attribute value
    tip.attr = function(n, v) {
        if (arguments.length < 2 && typeof n === 'string') {
            return getNodeEl().attr(n)
        } else {
            var args =  Array.prototype.slice.call(arguments)
            d3.selection.prototype.attr.apply(getNodeEl(), args)
        }

        return tip
    }

    // Public: Proxy style calls to the d3 tip container.  Sets or gets a style value.
    //
    // n - name of the property
    // v - value of the property
    //
    // Returns tip or style property value
    tip.style = function(n, v) {
        // debugger;
        if (arguments.length < 2 && typeof n === 'string') {
            return getNodeEl().style(n)
        } else {
            var args = Array.prototype.slice.call(arguments);
            if (args.length === 1) {
                var styles = args[0];
                Object.keys(styles).forEach(function(key) {
                    return d3.selection.prototype.style.apply(getNodeEl(), [key, styles[key]]);
                });
            }
        }

        return tip
    }

    // Public: Set or get the direction of the tooltip
    //
    // v - One of n(north), s(south), e(east), or w(west), nw(northwest),
    //     sw(southwest), ne(northeast) or se(southeast)
    //
    // Returns tip or direction
    tip.direction = function(v) {
        if (!arguments.length) return direction
        direction = v == null ? v : d3.functor(v)

        return tip
    }

    // Public: Sets or gets the offset of the tip
    //
    // v - Array of [x, y] offset
    //
    // Returns offset or
    tip.offset = function(v) {
        if (!arguments.length) return offset
        offset = v == null ? v : d3.functor(v)

        return tip
    }

    // Public: sets or gets the html value of the tooltip
    //
    // v - String value of the tip
    //
    // Returns html value or tip
    tip.html = function(v) {
        if (!arguments.length) return html
        html = v == null ? v : d3.functor(v)

        return tip
    }

    // Public: destroys the tooltip and removes it from the DOM
    //
    // Returns a tip
    tip.destroy = function() {
        if(node) {
            getNodeEl().remove();
            node = null;
        }
        return tip;
    }

    function d3_tip_direction() { return 'n' }
    function d3_tip_offset() { return [0, 0] }
    function d3_tip_html() { return ' ' }

    var direction_callbacks = {
        n:  direction_n,
        s:  direction_s,
        e:  direction_e,
        w:  direction_w,
        nw: direction_nw,
        ne: direction_ne,
        sw: direction_sw,
        se: direction_se
    };

    var directions = Object.keys(direction_callbacks);

    function direction_n() {
        var bbox = getScreenBBox()
        return {
            top:  bbox.n.y - node.offsetHeight,
            left: bbox.n.x - node.offsetWidth / 2
        }
    }

    function direction_s() {
        var bbox = getScreenBBox()
        return {
            top:  bbox.s.y,
            left: bbox.s.x - node.offsetWidth / 2
        }
    }

    function direction_e() {
        var bbox = getScreenBBox()
        return {
            top:  bbox.e.y - node.offsetHeight / 2,
            left: bbox.e.x
        }
    }

    function direction_w() {
        var bbox = getScreenBBox()
        return {
            top:  bbox.w.y - node.offsetHeight / 2,
            left: bbox.w.x - node.offsetWidth
        }
    }

    function direction_nw() {
        var bbox = getScreenBBox()
        return {
            top:  bbox.nw.y - node.offsetHeight,
            left: bbox.nw.x - node.offsetWidth
        }
    }

    function direction_ne() {
        var bbox = getScreenBBox()
        return {
            top:  bbox.ne.y - node.offsetHeight,
            left: bbox.ne.x
        }
    }

    function direction_sw() {
        var bbox = getScreenBBox()
        return {
            top:  bbox.sw.y,
            left: bbox.sw.x - node.offsetWidth
        }
    }

    function direction_se() {
        var bbox = getScreenBBox()
        return {
            top:  bbox.se.y,
            left: bbox.e.x
        }
    }

    function initNode() {
        var node = d3.select(document.createElement('div'))
        node
            .style('position', 'absolute')
            .style('top', 0)
            .style('opacity', 0)
            .style('pointer-events', 'none')
            .style('box-sizing', 'border-box')

        return node.node()
    }

    function getSVGNode(el) {
        el = el.node()
        if(el.tagName.toLowerCase() === 'svg')
            return el

        return el.ownerSVGElement
    }

    function getNodeEl() {
        if(node === null) {
            node = initNode();
            // re-add node to DOM
            document.body.appendChild(node);
        };
        return d3.select(node);
    }

    // Private - gets the screen coordinates of a shape
    //
    // Given a shape on the screen, will return an SVGPoint for the directions
    // n(north), s(south), e(east), w(west), ne(northeast), se(southeast), nw(northwest),
    // sw(southwest).
    //
    //    +-+-+
    //    |   |
    //    +   +
    //    |   |
    //    +-+-+
    //
    // Returns an Object {n, s, e, w, nw, sw, ne, se}
    function getScreenBBox() {
        var targetel   = target || d3.event.target;

        while ('undefined' === typeof targetel.getScreenCTM && 'undefined' === targetel.parentNode) {
            targetel = targetel.parentNode;
        }

        var bbox       = {},
            matrix     = targetel.getScreenCTM(),
            tbbox      = targetel.getBBox(),
            width      = tbbox.width,
            height     = tbbox.height,
            x          = tbbox.x,
            y          = tbbox.y

        point.x = x
        point.y = y
        bbox.nw = point.matrixTransform(matrix)
        point.x += width
        bbox.ne = point.matrixTransform(matrix)
        point.y += height
        bbox.se = point.matrixTransform(matrix)
        point.x -= width
        bbox.sw = point.matrixTransform(matrix)
        point.y -= height / 2
        bbox.w  = point.matrixTransform(matrix)
        point.x += width
        bbox.e = point.matrixTransform(matrix)
        point.x -= width / 2
        point.y -= height / 2
        bbox.n = point.matrixTransform(matrix)
        point.y += height
        bbox.s = point.matrixTransform(matrix)

        return bbox
    }

    return tip
};
'use strict'
angular.module('pcagnosticsviz')
    .component('biPlot', {
            //template: "<svg id =\'bi-plot\' width=\'100%\' class=\"\"></svg>",
        templateUrl: 'components/d3-biplot/bi-plot.html',
        controller: ["$scope", function ($scope) {
                d3.selectAll('.background-biplot')
                    .style('fill','#ffffff')
                    .attr('width',$('.biplot').width())
                    .attr('height',$('.biplot').width());
                // var menu = d3.select("#bi-plot");
                // menu.append('text').text('toggle zoom');
                // menu.append('rect')
        }]});

'use strict';

angular.module('pcagnosticsviz')
  .directive('cqlQueryEditor', ["Spec", function(Spec) {
    return {
      templateUrl: 'components/cqlQueryEditor/cqlQueryEditor.html',
      restrict: 'E',
      scope: {},
      link: function postLink(scope /*, element, attrs*/) {
        scope.Spec = Spec;
      }
    };
  }]);

'use strict';

angular.module('pcagnosticsviz')
  .directive('configurationEditor', function() {
    return {
      templateUrl: 'components/configurationeditor/configurationeditor.html',
      restrict: 'E',
      scope: {},
      controller: ["$scope", "Config", function($scope, Config) {
        $scope.Config = Config;
      }]
    };
  });

angular.module("pcagnosticsviz").run(["$templateCache", function($templateCache) {$templateCache.put("app/main/main.html","<div ng-controller=\"MainCtrl\" ng-class=\"{light: themeDrak}\" class=\"flex-root vflex full-width full-height\" ng-mousedown=\"onMouseDownLog($event)\" ng-mouseenter=\"onMouseEnterLog($event)\" ng-mouseover=\"onMouseOverLog($event)\"><div class=\"full-width no-shrink shadow\"><div class=\"card top-card no-right-margin no-top-margin\"><div class=\"hflex\" style=\"justify-content: space-between;\"><div id=\"logo\" ng-click=\"Logger.export()\"></div><div class=\"pane\"><div class=\"controls\"><a ng-show=\"Bookmarks.isSupported\" class=\"command\" ng-click=\"showModal(\'bookmark-list\')\"><i class=\"fa fa-bookmark\"></i> Bookmarks ({{Bookmarks.list.length}})</a> <a class=\"command\" ng-click=\"chron.undo()\" ng-class=\"{disabled: !canUndo}\"><i class=\"fa fa-undo\"></i> Undo</a> <a class=\"command\" ng-click=\"chron.redo()\" ng-class=\"{disabled: !canRedo}\"><i class=\"fa fa-repeat\"></i> Redo</a></div></div><div class=\"pane\"><div class=\"controls\"><a class=\"command\" ng-if=\"themeDrak\" ng-click=\"changetheme()\"><i class=\"fa fa-moon-o\"></i> Dark</a> <a class=\"command\" ng-if=\"!themeDrak\" ng-click=\"changetheme()\"><i class=\"fa fa-sun-o\"></i> Light</a></div></div></div></div><alert-messages></alert-messages></div><div class=\"hflex full-width main-panel grow-1\"><div class=\"pane data-pane noselect\"><div class=\"card no-top-margin data-card abs-100 modifedside\"><div class=\"sidebar-header\" ng-if=\"!embedded\"><h2>Data</h2><dataset-selector class=\"right\"></dataset-selector><div class=\"current-dataset\" title=\"{{Dataset.currentDataset.name}}\"><i class=\"fa fa-database\"></i> <span class=\"dataset-name\">{{Dataset.currentDataset.name}}</span></div></div><h3>Overview</h3><bi-plot></bi-plot><h3>Exemplar plots</h3><div class=\"scroll-y-nox scroll-y\"><vl-plot-group ng-if=\"PCAplot.chart\" class=\"main-vl-plot-group card no-shrink guideplot\" ng-repeat=\"chart in PCAplot.charts\" ng-class=\"{square: PCAplot.dim}\" ng-click=\"PCAplot.prop2spec(chart.prop)\" chart=\"chart\" show-bookmark=\"false\" show-debug=\"false\" show-select=\"true\" show-axis-prop=\"false\" show-sort=\"false\" show-transpose=\"false\" enable-pills-preview=\"true\" always-scrollable=\"false\" overflow=\"false\" show-label=\"false\" tooltip=\"true\" toggle-shelf=\"false\" style=\"margin-top: 0px; margin-bottom: 5px;\"></vl-plot-group><div class=\"hflex full-width\"><h3>Fields</h3><div class=\"header-drop active\"><i class=\"fa fa-caret-down droplist\" ng-click=\"fieldShow = !fieldShow\"></i></div></div><div ng-show=\"fieldShow\"><schema-list field-defs=\"Dataset.schema.fieldSchemas\" order-by=\"Dataset.fieldOrder\" show-count=\"true\" filter-manager=\"FilterManager\" show-add=\"true\"></schema-list></div><div ng-show=\"WildcardsShow\"><schema-list field-defs=\"Wildcards.list\" show-add=\"true\" show-drop=\"true\"></schema-list></div></div></div>Ma</div><div class=\"pane vis-pane\"><div class=\"vis-pane-container abs-100\" ng-class=\"{\'scroll-y\': !hideExplore || !Spec.isSpecific, \'no-scroll-y\': hideExplore && Spec.isSpecific}\"><div class=\"mainareacustom full-width\"><div class=\"pane encoding-pane\" style=\"min-height: 200px;\"><shelves spec=\"Spec.spec\" filter-manager=\"FilterManager\" preview=\"false\" support-any=\"true\" ng-class=\"shelvescustom\"></shelves><shelves class=\"preview\" ng-show=\"Spec.previewedSpec\" spec=\"Spec.previewedSpec || Spec.emptySpec\" preview=\"true\" support-any=\"true\"></shelves></div><slide-graph ng-if=\"PCAplot.prop.charts && Spec.isSpecific && !Spec.isEmptyPlot\" charts=\"PCAplot.prop.charts\" pos=\"PCAplot.prop.pos\" limitup=\"PCAplot.limitup\" limit=\"PCAplot.limit\"></slide-graph></div><div class=\"alternatives-pane card navigation\" ng-class=\"{collapse: hideExplore}\" ng-if=\"PCAplot.prop&&Spec.isSpecific && !Spec.isEmptyPlot\"><guide-menu prop=\"PCAplot.prop\" priority=\"2\" marks=\"PCAplot.marks\" props=\"PCAplot.types\" limitup=\"PCAplot.limitup\" limit=\"PCAplot.limit\"></guide-menu></div></div></div><div class=\"pane guidemenu grow-1\" ng-if=\"showExtraGuide||PCAplot.prop\"><div class=\"alternatives-pane card\" ng-class=\"{collapse: hideExplore}\" ng-if=\"Spec.isSpecific && !Spec.isEmptyPlot\"><div class=\"alternatives-header\"><div class=\"right alternatives-jump\"><a class=\"toggle-hide-explore\" ng-click=\"toggleHideExplore()\"><span ng-show=\"hideExplore\">Show <i class=\"fa fa-toggle-up\"></i></span> <span ng-show=\"!hideExplore\">Hide <i class=\"fa fa-toggle-down\"></i></span></a></div><h2>Expanded views</h2></div><div class=\"alternatives-content scroll-y\" ng-if=\"!hideExplore\"><vl-plot-group-list ng-repeat=\"alternative in PCAplot.alternatives\" ng-if=\"alternative.charts.length > 0 && (!$parent.alternativeType || $parent.alternativeType === alternative.type)\" id=\"alternatives-{{alternative.type}}\" list-title=\"alternative.title\" charts=\"alternative.charts\" enable-pills-preview=\"true\" priority=\"$index * 1000\" initial-limit=\"alternative.limit || null\" post-select-action=\"$parent.scrollToTop()\" show-query-select=\"true\" query=\"alternative.query\"></vl-plot-group-list></div></div></div></div><div class=\"hflex full-width dev-panel\" ng-if=\"showDevPanel\"><div class=\"pane\" ng-show=\"consts.logToWebSql\"><div class=\"card\"><div>userid: {{Logger.userid}}</div><button ng-click=\"Logger.clear()\">Clear logs</button><br><button ng-click=\"Logger.export()\">Download logs</button></div></div><div class=\"pane config-pane\"><div class=\"card scroll-y abs-100\"><configuration-editor></configuration-editor></div></div><div class=\"pane vl-pane\"><cql-query-editor></cql-query-editor></div><div class=\"pane vg-pane\"><vg-spec-editor></vg-spec-editor></div></div><bookmark-list highlighted=\"Fields.highlighted\" post-select-action=\"scrollToTop\"></bookmark-list><dataset-modal></dataset-modal></div>");
$templateCache.put("components/configurationeditor/configurationeditor.html","<form><pre>{{ Config.config | compactJSON }}</pre></form>");
$templateCache.put("components/cqlQueryEditor/cqlQueryEditor.html","<div class=\"card scroll-y abs-100 vflex\"><div><div class=\"right command\"><a ui-zeroclip=\"\" zeroclip-model=\"Spec.query | compactJSON\">Copy</a></div><h3>CompassQL Query</h3></div><textarea class=\"cqlquery flex-grow-1 full-height\" json-input=\"\" type=\"text\" ng-model=\"Spec.cleanQuery\"></textarea></div>");
$templateCache.put("components/d3-biplot/bi-plot.html","<svg id=\"bi-plot\" width=\"100%\" class=\"biplot\"><g id=\"bi-plot2\"></g><rect class=\"overlay\"></rect><g id=\"bi-plot-g\"><g id=\"bi-plot-axis\"></g><g id=\"bi-plot-point\"></g></g></svg>");
$templateCache.put("components/d3-guideplot/gplot.html","<div class=\"gplot\" ng-click=\"explore()\"><svg class=\"gplotSvg\" id=\"gplot{{pcaDef}}\"></svg></div>");
$templateCache.put("components/d3-guideplot/guide-plot.html","<div id=\"guide-plot-group\" class=\"guideplot\"><g-plot ng-repeat=\"pcaDef in pcaDefs\" pca-def=\"pcaDef\" id=\"{{pcaDef}}\"></g-plot></div>");
$templateCache.put("components/d3-slidegraph/slide-com.html","<li class=\"item wrap\"><vl-plot-group ng-if=\"chart!=undefined\" class=\"item\" chart=\"chart\" show-bookmark=\"true\" show-debug=\"false\" show-select=\"false\" show-axis-prop=\"false\" show-sort=\"false\" show-transpose=\"false\" enable-pills-preview=\"true\" always-scrollable=\"false\" overflow=\"false\" show-label=\"false\" tooltip=\"true\" toggle-shelf=\"true\"></vl-plot-group></li>");
$templateCache.put("components/d3-slidegraph/slide-graph.html","<div class=\"slideGraph card no-top-margin\"><h2>Focus view</h2><div class=\"wrap\"><button class=\"butSlider\" ng-click=\"prev()\"><i class=\"fa fa-angle-double-up\"></i></button><div class=\"scroller\"><ul class=\"items-slider\"><slide-com ng-repeat=\"chart in buffer track by $index\" chart=\"chart\"></slide-com></ul></div><button class=\"butSlider\" ng-click=\"next()\"><i class=\"fa fa-angle-double-down\"></i></button></div></div>");
$templateCache.put("components/guidemenu/guideMenu.html","<div class=\"contain\"><div class=\"sidebar-header\"><h2>Guided navigation</h2><div class=\"features\"><div id=\"typeselectcontain\"><label for=\"typeselect\">Feature type</label><select class=\"typeselect field-info pill\" id=\"typeselect\" ng-model=\"prop.type\" ng-options=\"type for type in props\" ng-change=\"typeChange()\"></select></div><div><label for=\"markselect\">Abstraction</label><select class=\"markselect field-info pill\" id=\"markselect\" ng-model=\"prop.mark\" ng-options=\"item.mark as item.label for item in marks\" ng-change=\"markChange()\"></select></div></div></div><div class=\"thum\"><svg viewbox=\"0 0 1200 1200\" width=\"100%\" height=\"100%\" preserveaspectratio=\"xMidYMid meet\" style=\"background-color: white;\"><g class=\"oneDimentional\"><g class=\"twoDimentional\"></g><g class=\"foreignObject\" ng-if=\"prop.dim==0\" ng-repeat=\"chart in prop.previewcharts track by generateID(chart)\" ng-class=\"{\'active\': prop.pos== $index}\" fo-repeat-directive=\"\"><foreignobject x=\"-135\" y=\"-65\" width=\"300\" height=\"110\"><vl-plot-group ng-if=\"prop.previewcharts\" class=\"main-vl-plot-group card thumplot no-shrink\" ng-class=\"{\'square\':prop.dim}\" ng-click=\"previewSlider($index)\" chart=\"chart\" show-bookmark=\"false\" show-debug=\"false\" show-select=\"false\" show-axis-prop=\"true\" show-sort=\"false\" show-transpose=\"false\" enable-pills-preview=\"true\" always-scrollable=\"false\" overflow=\"false\" show-label=\"false\" tooltip=\"true\" toggle-shelf=\"false\" priority=\"priority * $index\"></vl-plot-group></foreignobject></g></g></svg></div></div>");
$templateCache.put("components/vgSpecEditor/vgSpecEditor.html","<div class=\"card scroll-y abs-100 vflex no-right-margin\"><div><div class=\"right\"><a class=\"command\" ui-zeroclip=\"\" zeroclip-model=\"Spec.chart.vgSpec | compactJSON\">Copy</a><lyra-export></lyra-export></div><h3>Vega Specification</h3></div><textarea class=\"vgspec flex-grow-1\" json-input=\"\" disabled=\"disabled\" type=\"text\" ng-model=\"Spec.chart.vgSpec\"></textarea></div>");}]);