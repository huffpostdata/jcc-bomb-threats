(function(svg) {
  var div = document.querySelector('#hpd-jcc-threats');
  if (!div) throw new Error('Missing <div id="#hpd-jcc-threats">');

  div.innerHTML = svg.html + '<div class="tooltip"></div>';
  var svgNode = div.querySelector('svg');
  var tooltip = div.querySelector('.tooltip');
  var tooltipCircle = null; // currently-visible tooltip
  var highlightCircle = null;

  function threatToHtml(threat) {
    return [
      '<li>',
        '<time datetime="', threat.date, '">', formatDateS(threat.date), '</time>',
        '<span class="city">', threat.city, '</span>',
        '<span class="place">', threat.place, '</span>',
      '</li>'
    ].join('');
  }

  function descToHtml(desc) {
    var threats = JSON.parse(desc);
    var places = {};
    threats.forEach(function(threat) { places[threat.place] = null; })
    var nPlaces = Object.keys(places).length;

    var sentence = nPlaces === 1 ? '' : ('<h5>' + nPlaces + ' JCCs threatened</h5>');

    return [
      '<div class="tooltip-inner">',
        sentence,
        '<ol>',
          threats.map(threatToHtml).join(''),
        '</ol>',
      '</div>'
    ].join('');
  }

  function positionTooltipAboveCircle(circle) {
    var divBBox = div.getBoundingClientRect();
    var circleBBox = circle.getBoundingClientRect();
    var w = tooltip.clientWidth;
    var h = tooltip.clientHeight;

    var left = circleBBox.left - divBBox.left + circleBBox.width / 2 - w / 2;
    if (left + w > divBBox.width) left = divBBox.width - w;
    if (left < 0) left = 0;

    tooltip.style.top = (circleBBox.top - divBBox.top - h - 16) + 'px';
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
      highlightCircle.parentNode.removeChild(highlightCircle);
      highlightCircle = null;
    }

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

    highlightCircle = circle.cloneNode();
    highlightCircle.setAttribute('class', 'highlight');
    svgNode.appendChild(highlightCircle);

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
})
