// Assumes array has already been sorted.
Array.prototype.percentile = function(p) {
  var i = (this.length - 1) * p + 1;
  if (i <= 1) { 
    return this[0];
  } else if (i >= this.length)  {
    return this[this.length - 1];
  } else {
   var ii = Math.floor(i);
   return this[ii - 1] + (ii - i) * (this[ii] - this[ii - 1]);
  }     
};

App = Ember.Application.create({
  group_by:function(data, grouper) {
    var groups = {};
    data.forEach(function(item){
      var x = grouper(item);
      if( !groups[x] ) {
        groups[x] = [];
      }
      groups[x].push(item);
    });
    var rc = [];
    for( i in groups ) {
      rc.push({
        key:i,
        values: groups[i]
      })
    }
    return rc;
  },
  
  map_entry_array:function(map) {
    var rc = []
    for( key in map ) {
      rc.push({key:key, value:map[key] })
    }
    return rc;
  },

});

App.MainController = Ember.Controller.extend({
  tabs:["Scenarios","Trends"],
  selected_tab:"Scenarios",
  tab_selected_scenarios:function() {
    return this.get("selected_tab") == "Scenarios"
  }.property("selected_tab"),
  tab_selected_trends:function() {
    return this.get("selected_tab") == "Trends"
  }.property("selected_tab"),
}).create();

App.ScenariosController = Ember.ArrayController.extend({
  content: [],
  parameters:[],
  show_producer_tp:true,
  show_consumer_tp:true,
  show_max_latency:false,
  show_errors:false,  
  box_wisker:false,  

  benchmarks_by_platform:function() {
    return App.group_by(this.get('content'), function(benchmark){
      return benchmark.platform;
    });
  }.property("content.@each"),

  onContentChange:function() {
    var content = this.get('content');
    var parameter_map = {};
    content.forEach(function(benchmark){
      benchmark.scenarios.forEach(function(scenario){
        for( key in scenario.parameters ) {
          if( !parameter_map[key] ) {
            parameter_map[key] = []
          }
          var value = scenario.parameters[key];
          if( ! parameter_map[key].contains(value) ) {
            parameter_map[key].push(value);
          }
        }
      });
    });
    
    var parameters = [];
    for( key in parameter_map) {
      parameter_map[key].forEach(function(parameter, index) {
        parameters.push(Ember.Object.create({
          key:key, 
          label:parameter, 
          show:index==0
        }));
      });
    }        
    this.set('parameters', Ember.ArrayProxy.create({ content:parameters}));
  }.observes("content.@each"),
  
  parameters_by_key:function() {
    return App.group_by(this.get('parameters'), function(parameter){
      return parameter.key;
    });
  }.property("parameters"),
  
  matching_scenarios:function() {
    var parameter_predicates = []
    this.get('parameters_by_key').forEach(function(parameter){
      var cur = null;
      parameter.values.forEach(function(value){
        if( value.get('show') ) {
          var key=parameter.key;
          var value=value.get('label');
          var last = cur || function(scenario) { return false };
          cur = function(scenario) {
            return last(scenario) || scenario.parameters[key] == value;
          }
        }
      });
      if( cur!=null ) {
        parameter_predicates.push(cur)
      }
    });
    
    var show_scenario = function(s) {
      if( parameter_predicates.length ==0 ) {
        return true;
      } else {
        return !parameter_predicates.find(function(predicate){
          return!predicate(s);
        });
      }
    }
    
    var show_producer_tp = this.get('show_producer_tp');
    var show_consumer_tp = this.get('show_consumer_tp');
    var show_max_latency = this.get('show_max_latency');
    var show_errors = this.get('show_errors');
        
    var group_by = {};
    var add_data = function(broker_name, scenario, metrics, units, scale_fn) {
      var group_key = JSON.stringify(scenario.parameters)+":"+metrics      
      if( !group_by[group_key] ) {
        group_by[group_key] = {
          title:group_key,
          parameters: App.map_entry_array(scenario.parameters),
          metrics:metrics,
          lines:[]
        }
      }
      var group = group_by[group_key];
      group.lines.push({
        label: broker_name+" "+metrics,
        x: scenario["timestamp"],
        y: scenario[metrics],
        units: units,
        scale_fn:scale_fn || function(x){ return x;}
      });
    }
    
    
    this.get('content').forEach(function(benchmark){
      if( benchmark.show ) {
        var broker_name = benchmark.benchmark_settings.broker_name;
        benchmark.scenarios.forEach(function(scenario) {
          if( show_scenario(scenario) ) {
            if( show_producer_tp ) {
              add_data(broker_name, scenario, "producer tp", "msg/sec");
            }
            if( show_consumer_tp ) {
              add_data(broker_name, scenario, "consumer tp", "msg/sec");
            }
            if( show_max_latency ) {
              add_data(broker_name, scenario, "max latency", "ms", function(value){
                return value / 1000000.0;
              });
            }
            if( show_errors ) {
              add_data(broker_name, scenario, "errors", "errors/sec");
            }
          }
        });
      }
    });
    
    var rc = [];
    for( key in group_by ) {
      rc.push(group_by[key]);
    }
    return Ember.ArrayProxy.create({ content:rc });
  }.property(
    "content.@each.show", 
    "show_producer_tp", 
    "show_consumer_tp", 
    "show_max_latency",
    "show_errors",  
    "parameters.@each.show"
    ),

}).create();

function with_commas(nStr) {
  nStr += '';
  x = nStr.split('.');
  x1 = x[0];
  x2 = x.length > 1 ? '.' + x[1] : '';
  var rgx = /(\d+)(\d{3})/;
  while (rgx.test(x1)) {
    x1 = x1.replace(rgx, '$1' + ',' + '$2');
  }
  return x1 + x2;
}
      
App.Chart = Ember.View.extend({
  content:null,
  width:"20em",
  height:"15em",
  box_wisker:false,
  
  didInsertElement: function() {
    this.redraw();
  },
  
  on_change: function() {
    this.redraw();
  }.observes("content", "width", "height", "box_wisker"),
  
  redraw: function() {
    
    var content = this.get('content');
    var width = this.get('width')
    var height = this.get('height')
    
    var times = content.lines[0].x

    var chart_div = $(document.createElement('div'));
    var legend_div = $(document.createElement('div'));

    this.$().html("");
    this.$().append(
      $(document.createElement('table')).append(
        $(document.createElement('row')).css({"vertical-align":"top"}).append(
          $(document.createElement('td')).append(chart_div), 
          $(document.createElement('td')).append(legend_div)
        )
      )
    );
     
    chart_div.css({
      height:height,
      width:width,
    });
    legend_div.css({
      padding: "10px",
      opacity: .8,
      background: '#F0FAFF', 
      'border-radius': '8px', 
      '-webkit-border-radius': '8px',
      '-moz-border-radius': '8px'
    });
          
    var box_wisker = this.get('box_wisker');
    var data_lines, options;
    if( box_wisker ) {
      options = {
        series: { boxwhisker: { show: true, useColor: true, boxWidth: 0.4, lineWidth: 0.5 }, shadowSize: 3 },
        legend: { container: legend_div, show: true},
        xaxis: { show:false }
      };
      data_lines = content.lines.map(function(line){
        var data = line.y.sortNumber();
        return {
          label: line.label, 
          data:[[1, data.percentile(0)], [2, data.percentile(.25)],  [3, data.percentile(.50)], [4, data.percentile(.75)], [5, data.percentile(1)] ], 
          units: line.units
        };
      });
    } else {
      options = {
        legend: { container: legend_div, show: true},
        boxwhisker: { show: false },
        lines: { show: true },
        crosshair: { mode: "x" },
        grid: { hoverable: true, autoHighlight: false },
        yaxis: {
          // min:0,
          tickFormatter: function(y, axis) {
            return with_commas(y.toFixed(axis.tickDecimals));
          }
        },              
      }
      data_lines = content.lines.map(function(line){
        var start = line.x[0];
        var data = [];
        for( var i=0; i < line.x.length; i++) {
          data.push([((line.x[i]-start)/1000)+1, line.scale_fn(line.y[i])]);
        }
        return {label: line.label, data:data, units: line.units };
      });
    }

    var plot = $.plot(chart_div, data_lines, options);
        
    function trigger_legend_update(event, pos) {

      var legend_labels = legend_div.find(".legendLabel");
      var axes = plot.getAxes();
      var out_of_range = pos==null || pos.x < axes.xaxis.min || pos.x > axes.xaxis.max || pos.y < axes.yaxis.min || pos.y > axes.yaxis.max;
      
      var dataset = plot.getData();
      
      var default_label = function(node, series) {
        
        var data = series.data.map(function(item){return item[1];});
        node.html(series.label+"<br><strong>stdev: </strong>"+
          with_commas(data.stdDev().toFixed(2))+" <strong>mean: </strong>"+
          with_commas(data.mean().toFixed(2))+")"
          );
      };
      
      for (var i = 0; i < dataset.length; ++i) {
        var series = dataset[i];
        if( out_of_range ) {
          for (j = 0; j < series.data.length; ++j) {
            default_label(legend_labels.eq(i), series);
          }          
        } else {
          
          // find the nearest points, x-wise
          var j;
          for (j = 0; j < series.data.length; ++j)
            if (series.data[j][0] > pos.x)
              break;

          // now interpolate
          var y, p1 = series.data[j - 1], p2 = series.data[j];
          if (p1 || p2) {
            if (p1 == null)
                y = p2[1];
            else if (p2 == null)
                y = p1[1];
            else
                y = p1[1] + (p2[1] - p1[1]) * (pos.x - p1[0]) / (p2[0] - p1[0]);

            if( y < 100 ) {
              y = y.toFixed(3)
            } else {
              y = y.toFixed(0)
            }
            legend_labels.eq(i).html(series.label + "<br>"+with_commas(y)+" "+series.units);
          } else {
            default_label(legend_labels.eq(i), series);
          }
          
        }
      }
    }
    if( !box_wisker ) {
      chart_div.bind("plothover",  trigger_legend_update);
      chart_div.mouseout(trigger_legend_update);
      trigger_legend_update(null, null)
    }    
  },
});

// Lets load the benchmark data files...
$.ajax({ url: "index.json", dataType:"json", 
  success: function(index_json) {
    products = index_json["products"];
    platforms = index_json["platforms"];
    platforms.forEach(function(platform) {
      var done = function(platform_description) {
        products.forEach(function(product) {
          $.ajax({ url: platform+"/"+product+".json", dataType:"json", success: function(data) {
            data.show = true;
            data.platform = platform;
            data.platform_description = platform_description;
            App.ScenariosController.get('content').pushObject(data);
          }});
        });
      };
      $.ajax({ url: platform+"/platform.json", dataType:"json", success: function(data) {
        done(data["description"]);
      }, error: function(){
        done("unknown");
      }
      });
    });
  },
  error: function(a,b,c,d) {
    alert("Could not load the index.json data file.");
  },
});

