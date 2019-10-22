import React from "react";
import { render } from "react-dom";
import { withStyles } from "@material-ui/core/styles";
import Chart from "./chart";
import 'bootstrap/dist/css/bootstrap.min.css';
import Button from 'react-bootstrap/Button';
import ButtonToolbar from "react-bootstrap/ButtonToolbar";
import DropdownButton from "react-bootstrap/DropdownButton";
import DropdownItem from "react-bootstrap/DropdownItem";
import Form from "react-bootstrap/Form";
import Col from "react-bootstrap/Col";
import {Grid, Input, InputLabel} from "@material-ui/core";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Alert from "react-bootstrap/Alert";


const styles = theme => ({
  "chart-container": {
    height: 400
  }
});

function toUTF8Array(str) {
  var utf8 = [];
  for (var i=0; i < str.length; i++) {
    var charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6),
          0x80 | (charcode & 0x3f));
    }
    else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12),
          0x80 | ((charcode>>6) & 0x3f),
          0x80 | (charcode & 0x3f));
    }
    // surrogate pair
    else {
      i++;
      // UTF-16 encodes 0x10000-0x10FFFF by
      // subtracting 0x10000 and splitting the
      // 20 bits of 0x0-0xFFFFF into two halves
      charcode = 0x10000 + (((charcode & 0x3ff)<<10)
          | (str.charCodeAt(i) & 0x3ff));
      utf8.push(0xf0 | (charcode >>18),
          0x80 | ((charcode>>12) & 0x3f),
          0x80 | ((charcode>>6) & 0x3f),
          0x80 | (charcode & 0x3f));
    }
  }
  return utf8;
}

class App extends React.Component {
  state = {
    selectedOrderType: 'Limit',
    session_id: undefined,
    tickerRef: "",
    lineChartData: {
      labels: [],
      datasets: [
        {
          type: "line",
          label: "BTC-USD",
          backgroundColor: "rgba(0, 0, 0, 0)",
          borderColor: this.props.theme.palette.primary.main,
          pointBackgroundColor: this.props.theme.palette.secondary.main,
          pointBorderColor: this.props.theme.palette.secondary.main,
          borderWidth: "2",
          lineTension: 0.45,
          data: []
        }
      ]
    },
    lineChartOptions: {
      responsive: true,
      maintainAspectRatio: false,
      tooltips: {
        enabled: true
      },
      scales: {
        xAxes: [
          {
            ticks: {
              autoSkip: true,
              maxTicksLimit: 10
            }
          }
        ]
      }
    }
  };

  componentDidMount() {
    const subscribe = {
      type: "subscribe",
      channels: [
        {
          name: "ticker",
          product_ids: ["BTC-USD"]
        }
      ]
    };

    this.ws = new WebSocket("wss://ws-feed.gdax.com"); // replace this with the ticker feed

    this.submitsocket = new WebSocket("wss://ws-feed.gdax.com");

    this.submitsocket.onopen = () => {
        // authentication: send 32 bits with length of username string
      const username = "pie";
        const usernameBytes = toUTF8Array(username);
        let payload = new ArrayBuffer(usernameBytes.length + 4);
        payload.set(toBytesInt32(usernameBytes.length), 0);
      payload.set(usernameBytes, 4)
      this.submitsocket.send(bytes);
    }

    this.submitsocket.onmessage = e => {
      // we're authenticated!
      // store the session id we get back
      const response = new Uint32Array(e.data);
      console.assert(response.length == 1);
      const session_id = e.data.first;
      this.setState({ session_id: session_id })
    }

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify(subscribe));
    };

    this.ws.onmessage = e => {
      const value = JSON.parse(e.data);
      if (value.type !== "ticker") {
        return;
      }

      const oldBtcDataSet = this.state.lineChartData.datasets[0];
      const newBtcDataSet = { ...oldBtcDataSet };
      newBtcDataSet.data.push(value.price);

      const newChartData = {
        ...this.state.lineChartData,
        datasets: [newBtcDataSet],
        labels: this.state.lineChartData.labels.concat(
          new Date().toLocaleTimeString()
        )
      };
      this.setState({ lineChartData: newChartData });
    };
  }

  componentWillUnmount() {
    this.ws.close();
  }

  submissionHandler(e) {
    e.preventDefault();
  }

  onBuyPressed() {
    this.sendTemplateOrder(true);
  }

  onSellPressed() {
    this.sendTemplateOrder(false);
  }

  sendTemplateOrder(isBuySide) {
      this.sendOrder(isBuySide, false, this.tickerRef, 0, 1);
  }

  sendOrder(isBuySide, isLimit, ticker, limit, quantity) {
      console.assert(this.state.session_id !== "undefined");
      let payload = new ArrayBuffer(26);
      var firstByte = 0;
      // first two bits are command bits, always set to zero
      // next bit is if its buy side
      if (isBuySide) {
          firstByte = 0b00000100;
      }
      payload.set(firstByte, 0);
      payload.set(toBytesInt32(this.state.session_id), 1); // then the auth token
      if (isLimit) {
          payload.set(1, 5);
      }
      const tickerBytes = toUTF8Array(ticker);
      console.assert(tickerBytes.length === 4, "Ticker byes is " + tickerBytes + " long, expected 4");
      payload.set(tickerBytes, 6);
      payload.set(toBytesInt64(limit), 10);
      payload.set(toBytesInt64(quantity), 18);

      this.submitsocket.send(payload);
  }

  onDropdownMenuChange(eventKey) {
    this.setState({ selectedOrderType: eventKey })
  }

  render() {
    const { classes } = this.props;

    return (
      <div className={classes["chart-container"]}>
        <Chart
            data={this.state.lineChartData}
            options={this.state.lineChartOptions}
        />
        {this.renderBottom()}
      </div>
    );
  }

  renderBottom() {
    if (typeof this.state.session_id === "undefined") {
      return this.renderUnauthenticatedBottom()
    } else {
      return this.renderAuthenticatedBottom()
    }
  }

  renderUnauthenticatedBottom() {
    return <Alert variant={"primary"}>
      You're not logged in. If nothing happens, try refreshing the page
    </Alert>
  }

  renderAuthenticatedBottom() {
    return <>
      <Container>
        <Alert variant={"light"}>
          Logged in with ID {this.state.session_id}
        </Alert>
        <Form onSubmit={this.submissionHandler}>
          <Grid fluid={true}>
            <Form.Row>
              <Col>
                <DropdownButton id="dropdown-basic-button" title={this.state.selectedOrderType}
                                onSelect={this.onDropdownMenuChange.bind(this)}>
                  <DropdownItem key={"Market"} eventKey={"Market"}>Market</DropdownItem>
                  <DropdownItem key={"Limit"} eventKey={"Limit"}>Limit</DropdownItem>
                </DropdownButton>
              </Col>
              <Col>
                <Form.Control placeholder={"Ticker"}  inputRef={(ref) => {this.tickerRef = ref}} />
              </Col>
            </Form.Row>
          </Grid>
        </Form>
      </Container>
      <Container>
        <Row>
          <Col>
            <Button variant={"primary"} block onPress={this.onBuyPressed}>Buy</Button>
          </Col>
          <Col>
            <Button variant={"danger"} block onPress={this.onSellPressed}>Sell</Button>
          </Col>
        </Row>
      </Container>
    </>;
  }
}

function toBytesInt32 (num) {
    const arr = new ArrayBuffer(4); // an Int32 takes 4 bytes
    const view = new DataView(arr);
    view.setUint32(0, num, false); // byteOffset = 0; litteEndian = false
    return arr;
}

function toBytesInt64 (num) {
    const arr = new ArrayBuffer(8); // an Int64 takes 8 bytes
    const view = new DataView(arr);
    view.setBigUint64(0, num, false); // byteOffset = 0; litteEndian = false
    return arr;
}

export default withStyles(styles, { withTheme: true })(App);
