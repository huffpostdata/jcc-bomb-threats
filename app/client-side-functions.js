(function(svg) {
  var div = document.querySelector('#hpd-jcc-threats');
  if (!div) throw new Error('Missing <div id="#hpd-jcc-threats">');

  div.innerHTML = svg.html + '<div class="tooltip"></div>';
  var svgNode = div.querySelector('svg');
  var tooltip = div.querySelector('.tooltip');
  var tooltipCircle = null; // currently-visible tooltip

  function threatToHtml(threat) {
    return [
      '<li>',
        '<time datetime="', threat.date, '">', formatDateS(threat.date), '</time>',
        'Caller threatened ',
        '<span class="place">', threat.place, '</span>',
        ' in ',
        '<span class="city">', threat.city, '</span>',
      '</li>'
    ].join('');
  }

  function descToHtml(desc) {
    return [
      '<div class="tooltip-inner">',
        '<ol>',
          JSON.parse(desc).map(threatToHtml).join(''),
        '</ol>',
      '</div>'
    ].join('');
  }

  function positionTooltipAboveCircle(circle) {
    tooltip.style.top = '0px';
    tooltip.style.left = '0px';
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
    if (circle === null) {
      tooltip.innerHTML = '';
      tooltip.classList.remove('visible');
      return;
    }

    positionTooltipAboveCircle(circle);
    var desc = circle.parentNode.querySelector('desc');
    if (!desc) {
      console.warn("Missing `desc` near `circle`", circle);
      return;
    }

    tooltip.innerHTML = descToHtml(desc.innerHTML);
    tooltip.classList.add('visible');
  }

  function eventToCircle(ev) {
    var node = ev.target;
    while (node && node.tagName !== 'svg') {
      console.log(node.tagName);
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
