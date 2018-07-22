'use strict';

(function (factory, window){
  // define an AMD module that relies on 'leaflet'
  if (typeof define === 'function' && define.amd) {
    define(['leaflet'], factory);

  // define a Common JS module that relies on 'leaflet'
  } else if (typeof exports === 'object') {
    module.exports = factory(require('leaflet'));
  }

  // attach your plugin to the global 'L' variable
  if (typeof window !== 'undefined' && window.L) {
    window.L.CanvasIconLayer = factory(L);
  }
}(function (L){
  var CanvasIconLayer = (L.Layer ? L.Layer : L.Class).extend({
    initialize: function (options) {
      this.imageCache = {};
      this._zIndex = 0;

      L.setOptions(this, options);
    },

    setOptions: function (options) {
      L.setOptions(this, options);
      if (this._canvas) {
        this._updateOptions();
      }
      return this.redraw();
    },

    redraw: function () {
      this._redraw(true);
    },

    addMarker: function (marker) {
      L.Util.stamp(marker);

      if (!this._markers) this._markers = {};

      this._markers[marker._leaflet_id] = marker;

      var self = this;
      marker.on('move', this._scheduleRedraw, this);

      this._drawMarker(marker);
    },

    _scheduleRedraw: function() {
      if (!this._frame) {
        var self = this;
        this._frame = L.Util.requestAnimFrame(function() {
          self._redraw(true);
        });
      }
    },

    addLayer: function (layer) {
      if ((layer.options.pane == 'markerPane') && layer.options.icon) this.addMarker(layer);
      else console.error('Layer isn\'t a marker');
    },

    removeLayer: function (layer) {
      this.removeMarker(layer, true);
    },

    removeMarker: function (marker, redraw) {
      delete this._markers[marker._leaflet_id];
      if (redraw) {
        this._redraw(true);
      }
    },

    onAdd: function (map) {
      this._map = map;
      this._onClickListeners = [];

      if (!this._canvas) {
        this._initCanvas();
      }

      if (this.options.pane) {
        this.getPane().appendChild(this._canvas);
      } else {
        map._panes.overlayPane.appendChild(this._canvas);
      }

      map.on('move', this._reset, this);
      map.on('zoom', this._reset, this);
      map.on('click', this._executeClickListeners, this);
      map.on('mousemove', this._updateMouseCursor, this);
    },

    onRemove: function (map) {
      if (this.options.pane) {
        this.getPane().removeChild(this._canvas);
      } else {
        map.getPanes().overlayPane.removeChild(this._canvas);
      }
    },

    addTo: function (map) {
      map.addLayer(this);
      return this;
    },

    _drawMarker: function (marker) {
      var self = this;

      var pointPos = this._map.latLngToContainerPoint(marker.getLatLng());

      if (!marker.options.icon) return;
      var iconUrl = marker.options.icon.options.iconUrl;

      if (!this.imageCache[iconUrl]) {
        var self = this;
        this.imageCache[iconUrl] = new Image();
        this.imageCache[iconUrl].onload = function() { self._scheduleRedraw(); };
        this.imageCache[iconUrl].src = iconUrl;
      } else if (this.imageCache[iconUrl] && this.imageCache[iconUrl].complete && this.imageCache[iconUrl].naturalWidth !== 0) {
        self._drawImage(marker, pointPos);
      }
    },

    _drawImage: function (marker, pointPos) {
      this._context.globalAlpha = marker.options.opacity;
      marker._zIndex = this._zIndex++;

      var iconWidth = marker.options.icon.options.iconSize[0];
      var iconHeight = marker.options.icon.options.iconSize[1];

      if (pointPos.x < -iconWidth*2 || pointPos.y < -iconHeight*2 || pointPos.x > this._canvas.width + iconWidth*2 || pointPos.y > this._canvas.height + iconHeight*2) {
        return;
      }

      if (marker.options.icon.options.iconOrigin) {
        this._context.drawImage(
          this.imageCache[marker.options.icon.options.iconUrl],
          marker.options.icon.options.iconOrigin[0],
          marker.options.icon.options.iconOrigin[1],
          marker.options.icon.options.iconSize[0],
          marker.options.icon.options.iconSize[1],
          pointPos.x - marker.options.icon.options.iconAnchor[0],
          pointPos.y - marker.options.icon.options.iconAnchor[1],
          marker.options.icon.options.iconSize[0],
          marker.options.icon.options.iconSize[1]
        );
      } else {
        this._context.drawImage(
          this.imageCache[marker.options.icon.options.iconUrl],
          pointPos.x - marker.options.icon.options.iconAnchor[0],
          pointPos.y - marker.options.icon.options.iconAnchor[1],
          marker.options.icon.options.iconSize[0],
          marker.options.icon.options.iconSize[1]
        );
      }
    },

    _reset: function () {
      var topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);

      var size = this._map.getSize();

      this._canvas.width = size.x;
      this._canvas.height = size.y;

      this._redraw();
    },

    _redraw: function (clear) {
      this._frame = null;
      this._zIndex = 0;

      if (!this._map) {
          return;
      }

      if (clear) {
        this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);
      }

      if (this._markers) {
        Object.keys(this._markers).forEach(function(item){
          this._drawMarker(this._markers[item]);
        }, this)
      }
    },

    _initCanvas: function () {
      this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-icon-layer leaflet-layer');

      // Match default marker zIndex
      this._canvas.style.zIndex = 600;

      var size = this._map.getSize();
      this._canvas.width  = size.x;
      this._canvas.height = size.y;

      this._context = this._canvas.getContext('2d');

      var animated = this._map.options.zoomAnimation && L.Browser.any3d;
      L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));
      if (animated) {
        var self = this;
        map.on('zoomanim', function(e) {
          self._animateZoom(e);
        });
      }
    },

    _updateOptions: function () {

    },

    _executeClickListeners: function(event) {
      var highestMarker = null;

      for (var markerId in this._markers) {
        var marker = this._markers[markerId];
        var point = this._map.latLngToContainerPoint(this._markers[markerId].getLatLng());

        if (this._hit(marker, point, event) && marker.options.opacity > 0.0) {
          if (!highestMarker || marker._zIndex > highestMarker._zIndex) {
            highestMarker = marker;
          }
        }
      }

      if (highestMarker) {
        highestMarker.fire('click');
      }
    },

    _updateMouseCursor: function(event) {
      var highestMarker = null;

      for (var markerId in this._markers) {
        var marker = this._markers[markerId];
        var point = this._map.latLngToContainerPoint(this._markers[markerId].getLatLng());

        if (marker.options.opacity > 0.0 && marker.options.icon && this._hit(marker, point, event)) {
          if (!highestMarker || marker._zIndex > highestMarker._zIndex) {
            highestMarker = marker;
          }
        }
      }

      if (highestMarker) {
        this._map._container.style.cursor = 'pointer';
        if (highestMarker.options.title) this._showTooltip(highestMarker);
      } else {
        this._map._container.style.cursor = '';
        this._hideTooltip();
      }
    },

    _showTooltip(marker) {
      if (!this._tooltip) {
        this._tooltip = document.createElement('div');
        this._tooltip.className = 'leaflet-canvas-tooltip';
        this._canvas.parentNode.insertBefore(this._tooltip, this._canvas.nextSibling);
      }

      this._tooltip.style.display = 'block';

      var markerPos = this._map.latLngToContainerPoint(marker.getLatLng());

      this._tooltip.style.left = markerPos.x + 'px';
      this._tooltip.style.top = markerPos.y + 'px';
      this._tooltip.style.transform = this._canvas.style.transform;
      this._tooltip.style.zIndex = 700;
      this._tooltip.innerText = marker.options.title;
    },

    _hideTooltip() {
      if (this._tooltip) {
        this._tooltip.style.display = 'none';
      }
    },

    _hit: function(marker, point, event) {
      if (marker.options.icon) {
        var width = marker.options.icon.options.iconSize[0];
        var height = marker.options.icon.options.iconSize[1];
        var offsetWidth = marker.options.icon.options.iconAnchor[0];
        var offsetHeight = marker.options.icon.options.iconAnchor[1];
        var x = event.containerPoint.x;
        var y = event.containerPoint.y;
        return x >= point.x - offsetWidth && x <= point.x - offsetWidth + width && y >= point.y - offsetHeight && y <= point.y - offsetHeight + height;
      } else {
        return false;
      }
    },

    /*
      Derived from L.CanvasLayer.js:

      Licensed under MIT
      Copyright (c) 2016 Stanislav Sumbera,
      http://blog.sumbera.com/2014/04/20/leaflet-canvas/

      Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files
      (the "Software"), to deal in the Software without restriction, including without limitation the rights to use,
      copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software,
      and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

      The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

      THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
      INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
      IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
      WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
      OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
    */
    _setTransform: function (el, offset, scale) {
        var pos = offset || new L.Point(0, 0);

        el.style[L.DomUtil.TRANSFORM] =
      (L.Browser.ie3d ?
        'translate(' + pos.x + 'px,' + pos.y + 'px)' :
        'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
      (scale ? ' scale(' + scale + ')' : '');
    },

    //------------------------------------------------------------------------------
    _animateZoom: function (e) {
        var scale = this._map.getZoomScale(e.zoom);
        // -- different calc of animation zoom  in leaflet 1.0.3 thanks @peterkarabinovic, @jduggan1
        var offset = L.Layer ? this._map._latLngBoundsToNewLayerBounds(this._map.getBounds(), e.zoom, e.center).min :
                               this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());

        L.DomUtil.setTransform(this._canvas, offset, scale);
    }
  });

  L.canvasIconLayer = function (options) {
    return new CanvasIconLayer(options);
  };
}, window));
