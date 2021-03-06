import PropTypes from "prop-types";
import React from "react";
import { VictoryContainer, VictoryTooltip, Helpers, TextSize } from "victory-core";
import VoronoiHelpers from "./voronoi-helpers";
import { omit, defaults, isFunction } from "lodash";

export const voronoiContainerMixin = (base) => class VictoryVoronoiContainer extends base {
  static displayName = "VictoryVoronoiContainer";
  static propTypes = {
    ...VictoryContainer.propTypes,
    activateData: PropTypes.bool,
    activateLabels: PropTypes.bool,
    disable: PropTypes.bool,
    labelComponent: PropTypes.element,
    labels: PropTypes.func,
    onActivated: PropTypes.func,
    onDeactivated: PropTypes.func,
    radius: PropTypes.number,
    voronoiBlacklist: PropTypes.arrayOf(PropTypes.string),
    voronoiDimension: PropTypes.oneOf(["x", "y"]),
    voronoiPadding: PropTypes.number
  };
  static defaultProps = {
    ...VictoryContainer.defaultProps,
    activateData: true,
    activateLabels: true,
    labelComponent: <VictoryTooltip/>,
    voronoiPadding: 5
  };

  static defaultEvents = (props) => {
    return [{
      target: "parent",
      eventHandlers: {
        onMouseLeave: (evt, targetProps) => {
          return props.disable ? {} : VoronoiHelpers.onMouseLeave(evt, targetProps);
        },
        onTouchCancel: (evt, targetProps) => {
          return props.disable ? {} : VoronoiHelpers.onMouseLeave(evt, targetProps);
        },
        onMouseMove: (evt, targetProps) => {
          return props.disable ? {} : VoronoiHelpers.onMouseMove(evt, targetProps);
        },
        onTouchMove: (evt, targetProps) => {
          return props.disable ? {} : VoronoiHelpers.onMouseMove(evt, targetProps);
        }
      }
    }, {
      target: "data",
      eventHandlers: props.disable ? {} : {
        onMouseOver: () => null,
        onMouseOut: () => null,
        onMouseMove: () => null
      }
    }];
  };

  getLabelPadding(style) {
    if (!style) {
      return 0;
    }
    const paddings = Array.isArray(style) ? style.map((s) => s.padding) : [style.padding];
    return Math.max(...paddings, 0);
  }

  getFlyoutSize(labelComponent, text, style) {
    const padding = this.getLabelPadding(style);
    const textSize = TextSize.approximateTextSize(text, style);
    return {
      x: labelComponent.width || textSize.width + padding,
      y: labelComponent.height || textSize.height + padding
    };
  }

  getLabelCornerRadius(props, labelProps) {
    if (typeof labelProps.cornerRadius !== "undefined") {
      return labelProps.cornerRadius;
    }
    const theme = props.theme || labelProps.theme;
    return theme.tooltip && theme.tooltip.cornerRadius || 0;
  }

  getFlyoutExtent(position, props, labelProps) {
    const { text, style } = labelProps;
    const { orientation, dx = 0, dy = 0 } = labelProps;
    const flyoutSize = this.getFlyoutSize(props.labelComponent, text, style);
    const cornerRadius = this.getLabelCornerRadius(props, labelProps);
    const x = position.x + dx + 2 * cornerRadius;
    const y = position.y + dy + 2 * cornerRadius;
    const width = orientation === "top" || orientation === "bottom" ?
      flyoutSize.x / 2 :
      flyoutSize.x;
    const horizontalSign = orientation === "left" ? -1 : 1;
    const verticalSign = orientation === "bottom" ? 1 : -1;
    const extent = {};
    if (orientation === "top" || orientation === "bottom") {
      extent.x = [x - width, x + width];
    } else {
      extent.x = [x, x + horizontalSign * width];
    }
    extent.y = [y, y + verticalSign * flyoutSize.y];
    return {
      x: [Math.min(...extent.x), Math.max(...extent.x)],
      y: [Math.min(...extent.y), Math.max(...extent.y)]
    };
  }

  getLabelPosition(props, points, labelProps) {
    const { mousePosition, voronoiDimension, scale, voronoiPadding } = props;
    const basePosition = Helpers.scalePoint(props, omit(points[0], ["_voronoiX", "_voronoiY"]));
    if (!voronoiDimension || points.length < 2) {
      return basePosition;
    }

    const x = voronoiDimension === "y" ? mousePosition.x : basePosition.x;
    const y = voronoiDimension === "x" ? mousePosition.y : basePosition.y;
    if (props.polar) {
      // TODO: Should multi-point tooltips be constrained within a circular chart?
      return { x, y };
    }
    const range = { x: scale.x.range(), y: scale.y.range() };
    const extent = {
      x: [Math.min(...range.x) + voronoiPadding, Math.max(...range.x) - voronoiPadding],
      y: [Math.min(...range.y) + voronoiPadding, Math.max(...range.y) - voronoiPadding]
    };
    const flyoutExtent = this.getFlyoutExtent({ x, y }, props, labelProps);
    const adjustments = {
      x: [
        flyoutExtent.x[0] < extent.x[0] ? extent.x[0] - flyoutExtent.x[0] : 0,
        flyoutExtent.x[1] > extent.x[1] ? flyoutExtent.x[1] - extent.x[1] : 0
      ],
      y: [
        flyoutExtent.y[0] < extent.y[0] ? extent.y[0] - flyoutExtent.y[0] : 0,
        flyoutExtent.y[1] > extent.y[1] ? flyoutExtent.y[1] - extent.y[1] : 0
      ]
    };
    return {
      x: Math.round(x + adjustments.x[0] - adjustments.x[1]),
      y: Math.round(y + adjustments.y[0] - adjustments.y[1])
    };
  }

  getStyle(props, points, type) {
    const { labels, labelComponent, theme } = props;
    const componentProps = labelComponent.props || {};
    const themeStyles = theme && theme.voronoi && theme.voronoi.style ? theme.voronoi.style : {};
    const componentStyleArray = type === "flyout" ?
      componentProps.flyoutStyle : componentProps.style;
    return points.reduce((memo, point, index) => {
      const text = Helpers.evaluateProp(labels, point, true);
      const textArray = text ? `${text}`.split("\n") : [];
      const baseStyle = point.style && point.style[type] || {};
      const componentStyle = Array.isArray(componentStyleArray) ?
        componentStyleArray[index] : componentStyleArray;
      const style = Helpers.evaluateStyle(
        defaults({}, componentStyle, baseStyle, themeStyles[type]), point, true
      );
      const styleArray = textArray.length ? textArray.map(() => style) : [style];
      memo = memo.concat(styleArray);
      return memo;
    }, []);
  }

  getDefaultLabelProps(props, points) {
    const { voronoiDimension } = props;
    const multiPoint = voronoiDimension && points.length > 1;
    return {
      orientation: multiPoint ? "top" : undefined,
      pointerLength: multiPoint ? 0 : undefined
    };
  }

  getLabelProps(props, points) {
    const { labels, scale, labelComponent, theme } = props;
    const text = points.reduce((memo, point, index) => {
      const t = isFunction(labels) ? labels(point, index, points) : null;
      if (t === null || t === undefined) {
        return memo;
      }
      memo = memo.concat(`${t}`.split("\n"));
      return memo;
    }, []);
    const componentProps = labelComponent.props || {};
    const style = this.getStyle(props, points, "labels");

    const labelProps = defaults(
      {
        active: true,
        datum: omit(points[0], ["childName", "style", "continuous"]),
        flyoutStyle: this.getStyle(props, points, "flyout")[0],
        renderInPortal: false,
        scale, style, theme, text
      },
      componentProps,
      this.getDefaultLabelProps(props, points),
    );
    const labelPosition = this.getLabelPosition(props, points, labelProps);
    return defaults({}, labelPosition, labelProps);
  }

  getTooltip(props) {
    const { labels, activePoints, labelComponent } = props;
    if (!labels) {
      return null;
    }
    if (Array.isArray(activePoints) && activePoints.length) {
      return React.cloneElement(labelComponent, this.getLabelProps(props, activePoints));
    } else {
      return null;
    }
  }

  // Overrides method in VictoryContainer
  getChildren(props) {
    const children = React.Children.toArray(props.children);
    return [...children, this.getTooltip(props)].map((component, i) => {
      return component ? React.cloneElement(component, { key: i }) : null;
    });
  }
};

export default voronoiContainerMixin(VictoryContainer);
