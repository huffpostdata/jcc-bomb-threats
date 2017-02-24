(function(wrapperHtml, svgUrl, aspectRatio) {
  var div = document.querySelector('#hpd-jcc-threats');
  if (!div) throw new Error('Missing <div id="#hpd-jcc-threats">');
  var tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  var tooltipCircle = null; // currently-visible tooltip
  var highlightCircle = null;

  div.innerHTML = wrapperHtml
  var svgContainer = div.querySelector('.svg-container');
  svgContainer.style.paddingBottom = (100 / aspectRatio) + '%';

  function loadSvg(callback) {
    if (/^https?\:/.test(svgUrl)) {
      // svgUrl is a URL. Request its contents (requires CORS)
      var xhr = new XMLHttpRequest();
      xhr.open('GET', svgUrl, true);
      xhr.onreadystatechange = function() {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        if (xhr.status === 200) {
          return callback(null, xhr.responseText);
        } else {
          return callback(new Error('XMLHttpRequest got non-200 status code: ' + xhr.status));
        }
      }
      xhr.send(null);
    } else {
      // HACK: svgUrl is the SVG itself, because we're using an icky workaround
      // because our CORS headers won't arrive by deadline.
      setTimeout(function() { return callback(null, svgUrl); }, 0);
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    loadSvg(function(err, svgString) {
      if (err) throw err
      load(svgString);
    });
  });

  function load(svgString) {
    svgContainer.innerHTML = svgString;
    svgContainer.style.paddingBottom = '0';
    div.appendChild(tooltip);
    var svgNode = svgContainer.childNodes[0];

    function placeToHtml(place) {
      var times = place.threatDates
        .map(function(date) {
          return '<time datetime="' + date + '">' + formatDateS(date) + '</time>';
        })
        .join(', ');

      return [
        '<li>',
          '<span class="city">', place.city, '</span>', ', ',
          times,
          '<span class="place">', place.name, '</span>',
        '</li>'
      ].join('');
    }

    function descToHtml(desc) {
      return [
        '<div class="tooltip-inner">',
          '<ol>',
            JSON.parse(desc).map(placeToHtml).join(''),
          '</ol>',
        '</div>'
      ].join('');
    }

    function positionTooltipAboveCircle(circle) {
      // Set it such that it _can_ stretch to full width if need be
      tooltip.style.bottom = '0px'
      tooltip.style.left = '0px'

      // Now set bottom and left
      var divBBox = div.getBoundingClientRect();
      var circleBBox = circle.getBoundingClientRect();
      var w = tooltip.clientWidth;

      var left = circleBBox.left - divBBox.left + circleBBox.width / 2 - w / 2;
      if (left + w > divBBox.width) left = divBBox.width - w;
      if (left < 0) left = 0;

      tooltip.style.bottom = (divBBox.bottom - circleBBox.top + 8) + 'px';
      tooltip.style.left = left + 'px';
    }

    var Months = [ 'Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.' ];
    function formatDateS(dateS) {
      var year = parseFloat(dateS.slice(0, 4));
      var month = parseFloat(dateS.slice(5, 7));
      var day = parseFloat(dateS.slice(8, 10));
      return Months[month - 1] + ' ' + day;
    }

    function showTooltipForCircle(circle) {
      if (circle === tooltipCircle) return;
      tooltipCircle = circle;

      if (highlightCircle !== null) {
        highlightCircle.setAttribute('class', '');
      }

      highlightCircle = circle;

      if (circle === null) {
        tooltip.innerHTML = '';
        tooltip.classList.remove('visible');
        return;
      }

      var desc = circle.parentNode.querySelector('desc');
      if (!desc) {
        console.warn("Missing `desc` near `circle`", circle);
        return;
      }

      highlightCircle.setAttribute('class', 'highlight');

      tooltip.innerHTML = descToHtml(desc.innerHTML);
      tooltip.classList.add('visible'); // before positioning, so width calculation works
      positionTooltipAboveCircle(circle);
    }

    function eventToCircle(ev) {
      var node = ev.target;
      while (node && node.tagName !== 'svg') {
        if (node.tagName === 'circle') return node;
        node = node.parentNode;
      }
      return null;
    }

    svgNode.addEventListener('mousemove', function(ev) {
      var circle = eventToCircle(ev);
      showTooltipForCircle(circle);
    });

    svgNode.addEventListener('mouseleave', function(ev) {
      showTooltipForCircle(null);
    });
  }
})
